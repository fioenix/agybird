import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

function brainWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'agybird-brain-subagent-'));
  const cwd = join(root, 'workspace');
  const brain = join(root, 'brain');
  mkdirSync(cwd);
  mkdirSync(brain);
  return { cwd, brain };
}

function writeImage(brain, conversationId, name) {
  const imagePath = join(brain, conversationId, name);
  mkdirSync(join(brain, conversationId), { recursive: true });
  writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff]));
  return imagePath;
}

// Shaped like the transcript agy 1.4.2 keeps for an image-generator subagent: a
// planner step that calls a tool, then a step holding that call's result.
function writeTranscript(brain, subagentConversation, calls) {
  const logs = join(brain, subagentConversation, '.system_generated', 'logs');
  mkdirSync(logs, { recursive: true });
  const steps = [];
  for (const { tool, media, status = 'DONE' } of calls) {
    steps.push({ step_index: steps.length, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ name: tool, args: {} }] });
    steps.push({
      step_index: steps.length,
      source: 'MODEL',
      type: 'GENERIC',
      status,
      ...(media ? { media: media.map((path) => ({ mime_type: 'image/jpeg', uri: pathToFileURL(path).href })) } : {}),
    });
  }
  writeFileSync(join(logs, 'transcript.jsonl'), `${steps.map((step) => JSON.stringify(step)).join('\n')}\n`);
}

// agy 1.2.16 moved image work to the `image-generator` subagent. The stream reports
// no image path; the subagent's transcript records each generate_image result.
test('accepts the image the image-generator transcript records', () => {
  const parsed = parseImageFixture();
  const { cwd, brain } = brainWorkspace();
  const imagePath = writeImage(brain, parsed.conversationId, 'red_disc_1792336600370.jpg');
  writeTranscript(brain, parsed.subagents[0].conversation_id, [
    { tool: 'generate_image', status: 'ERROR' },
    { tool: 'generate_image', media: [imagePath] },
  ]);

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.error, null);
  assert.deepEqual(verified.artifacts, [{ path: realpathSync(imagePath), size: 3 }]);
});

test('ignores brain images the transcript does not record as generated', () => {
  const parsed = parseImageFixture();
  const { cwd, brain } = brainWorkspace();
  const generated = writeImage(brain, parsed.conversationId, 'red_disc_1.jpg');
  writeImage(brain, parsed.conversationId, 'screenshot.png');
  writeImage(brain, parsed.conversationId, 'from_an_earlier_turn.jpg');
  writeTranscript(brain, parsed.subagents[0].conversation_id, [{ tool: 'generate_image', media: [generated] }]);

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.deepEqual(verified.artifacts.map((artifact) => basename(artifact.path)), ['red_disc_1.jpg']);
});

test('ignores media attached to results of tools other than generate_image', () => {
  const parsed = parseImageFixture();
  const { cwd, brain } = brainWorkspace();
  const viewed = writeImage(brain, parsed.conversationId, 'viewed.png');
  writeTranscript(brain, parsed.subagents[0].conversation_id, [{ tool: 'view_file', media: [viewed] }]);

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.artifacts.length, 0);
  assert.match(verified.error, /no valid image artifact/i);
});

test('rejects recorded media outside the conversation directories', () => {
  const parsed = parseImageFixture();
  const { cwd, brain } = brainWorkspace();
  const elsewhere = writeImage(brain, 'some-other-conversation', 'private.jpg');
  writeTranscript(brain, parsed.subagents[0].conversation_id, [{ tool: 'generate_image', media: [elsewhere] }]);

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.artifacts.length, 0);
});

test('requires the image-generator subagent itself to have finished', () => {
  const { cwd, brain } = brainWorkspace();
  const imagePath = writeImage(brain, 'conversation-main', 'bird.jpg');
  writeTranscript(brain, 'sub-image', [{ tool: 'generate_image', media: [imagePath] }]);
  const parsed = {
    conversationId: 'conversation-main',
    response: 'done',
    artifacts: [],
    toolCalls: [{ id: '3', name: 'invoke_subagent', status: 'done' }],
    subagents: [
      { type_name: 'image-generator', conversation_id: 'sub-image' },
      { type_name: 'research', conversation_id: 'sub-research' },
    ],
    completedSubagents: ['sub-research'],
  };

  const verified = verifyImageArtifacts(parsed, cwd, brain);

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

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.artifacts.length, 0);
});

// A path the parent agent merely mentions, such as the reference being edited, is
// not proof of generation when the subagent's transcript records no result.
test('accepts only transcript media for a subagent-backed run', () => {
  const parsed = parseImageFixture();
  const { cwd, brain } = brainWorkspace();
  const reference = join(cwd, 'reference.png');
  writeFileSync(reference, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  parsed.response = `Edited ${reference} as requested.`;
  parsed.artifacts = [reference];

  const verified = verifyImageArtifacts(parsed, cwd, brain);

  assert.equal(verified.artifacts.length, 0);
  assert.match(verified.error, /no valid image artifact/i);
});
