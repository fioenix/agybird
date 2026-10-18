import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createStreamParser, verifyImageArtifacts } from '../../scripts/agybird.mjs';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'streams');

test('accepts an image path reported in the terminal response under the matching brain conversation', () => {
  const root = mkdtempSync(join(tmpdir(), 'agybird-brain-'));
  const cwd = join(root, 'workspace');
  const brain = join(root, 'brain');
  const conversationId = 'conversation-123';
  const conversationRoot = join(brain, conversationId);
  const imagePath = join(conversationRoot, 'generated image.jpg');
  mkdirSync(cwd);
  mkdirSync(conversationRoot, { recursive: true });
  writeFileSync(imagePath, Buffer.from([1, 2, 3]));

  const parsed = {
    conversationId,
    response: `Generated artifact: \`${imagePath}\``,
    artifacts: [],
    toolCalls: [{ id: '3', name: 'generate_image', status: 'done' }],
  };
  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.error, null);
  assert.deepEqual(verified.artifacts, [{ path: realpathSync(imagePath), size: 3 }]);
});

test('rejects a provider brain artifact from a different conversation', () => {
  const root = mkdtempSync(join(tmpdir(), 'agybird-brain-spoof-'));
  const cwd = join(root, 'workspace');
  const brain = join(root, 'brain');
  const imagePath = join(brain, 'other-conversation', 'secret.jpg');
  mkdirSync(cwd);
  mkdirSync(join(brain, 'other-conversation'), { recursive: true });
  writeFileSync(imagePath, Buffer.from([1, 2, 3]));

  const parsed = {
    conversationId: 'expected-conversation',
    response: imagePath,
    artifacts: [],
    toolCalls: [{ id: '3', name: 'generate_image', status: 'done' }],
  };
  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.artifacts.length, 0);
  assert.match(verified.error, /no valid image artifact/i);
});

function parseImageFixture() {
  const parser = createStreamParser();
  parser.push(readFileSync(join(fixtureDirectory, 'agy-1.4.2-image-subagent.ndjson'), 'utf8'));
  return parser.finish();
}

function brainWithImage(conversationId, name, mtime) {
  const root = mkdtempSync(join(tmpdir(), 'agybird-brain-subagent-'));
  const cwd = join(root, 'workspace');
  const brain = join(root, 'brain');
  const imagePath = join(brain, conversationId, name);
  mkdirSync(cwd);
  mkdirSync(join(brain, conversationId, '.system_generated'), { recursive: true });
  writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff]));
  if (mtime !== undefined) utimesSync(imagePath, mtime, mtime);
  return { cwd, brain, imagePath };
}

// agy 1.2.16 moved image work to the `image-generator` subagent. Its image lands in
// the conversation's brain directory and its path is reported nowhere in the stream.
test('accepts an image the image-generator subagent saved during this run', () => {
  const parsed = parseImageFixture();
  const { cwd, brain, imagePath } = brainWithImage(parsed.conversationId, 'red_disc_1792336600370.jpg');

  const verified = verifyImageArtifacts(parsed, cwd, brain, { since: Date.now() - 60_000 });

  assert.equal(verified.error, null);
  assert.deepEqual(verified.artifacts, [{ path: realpathSync(imagePath), size: 3 }]);
});

test('also looks in the image-generator subagent conversation directory', () => {
  const parsed = parseImageFixture();
  const subagentConversation = parsed.subagents[0].conversation_id;
  const { cwd, brain, imagePath } = brainWithImage(subagentConversation, 'red_circle.png');

  const verified = verifyImageArtifacts(parsed, cwd, brain, { since: Date.now() - 60_000 });

  assert.deepEqual(verified.artifacts, [{ path: realpathSync(imagePath), size: 3 }]);
});

test('does not count an image left in the brain directory by an earlier turn', () => {
  const parsed = parseImageFixture();
  const old = new Date(Date.now() - 3_600_000);
  const { cwd, brain } = brainWithImage(parsed.conversationId, 'earlier.jpg', old);

  const verified = verifyImageArtifacts(parsed, cwd, brain, { since: Date.now() - 60_000 });

  assert.equal(verified.artifacts.length, 0);
  assert.match(verified.error, /no valid image artifact/i);
});

test('requires evidence of image generation before scanning for artifacts', () => {
  const { cwd, brain } = brainWithImage('conversation-plain', 'stray.png');
  const parsed = {
    conversationId: 'conversation-plain',
    response: 'done',
    artifacts: [],
    toolCalls: [{ id: '1', name: 'invoke_subagent', status: 'done' }],
    subagents: [{ type_name: 'research', conversation_id: 'sub-1' }],
  };

  const verified = verifyImageArtifacts(parsed, cwd, brain, { since: 0 });

  assert.equal(verified.artifacts.length, 0);
  assert.match(verified.error, /No image generation was observed/);
});

test('ignores a conversation id that would leave the brain directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'agybird-brain-escape-'));
  const cwd = join(root, 'workspace');
  const brain = join(root, 'brain');
  const outside = join(root, 'outside.png');
  mkdirSync(cwd);
  mkdirSync(brain);
  writeFileSync(outside, Buffer.from([1, 2, 3]));
  const parsed = {
    conversationId: '..',
    response: outside,
    artifacts: [],
    toolCalls: [{ id: '3', name: 'generate_image', status: 'done' }],
  };

  const verified = verifyImageArtifacts(parsed, cwd, brain, { since: 0 });

  assert.equal(verified.artifacts.length, 0);
});
