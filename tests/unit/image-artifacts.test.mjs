import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyImageArtifacts } from '../../scripts/agybird.mjs';

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
