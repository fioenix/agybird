import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgyArgs } from '../../scripts/agybird.mjs';

test('builds the minimal official headless invocation', () => {
  assert.deepEqual(
    buildAgyArgs({ mode: 'read', timeout: '90s' }, 'delegated prompt'),
    [
      '-p', 'delegated prompt',
      '--mode', 'plan',
      '--output-format', 'stream-json',
      '--print-timeout', '90s',
    ],
  );
});

test('maps explicitly supplied provider options without changing them', () => {
  const options = {
    mode: 'write',
    timeout: '10m',
    jsonSchema: '{"type":"object"}',
    conversation: 'conversation-42',
    model: 'gemini-example',
    effort: 'medium',
    agent: 'coder',
    sandbox: true,
  };

  assert.deepEqual(buildAgyArgs(options, 'task'), [
    '-p', 'task',
    '--mode', 'accept-edits',
    '--output-format', 'stream-json',
    '--print-timeout', '10m',
    '--json-schema', '{"type":"object"}',
    '--conversation', 'conversation-42',
    '--model', 'gemini-example',
    '--effort', 'medium',
    '--agent', 'coder',
    '--sandbox',
  ]);
});

test('does not emit implicit provider, sandbox, credit, or permission choices', () => {
  const args = buildAgyArgs({ mode: 'read', timeout: '10m', sandbox: false }, 'task');
  const serialized = args.join(' ');

  assert.doesNotMatch(serialized, /--model/);
  assert.doesNotMatch(serialized, /--effort/);
  assert.doesNotMatch(serialized, /--agent/);
  assert.doesNotMatch(serialized, /--sandbox/);
  assert.doesNotMatch(serialized, /useG1Credits/);
  assert.doesNotMatch(serialized, /dangerously-skip-permissions/);
});
