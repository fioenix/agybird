import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDelegationPrompt } from '../../scripts/agybird.mjs';

const task = 'Inspect `src/main.js` and explain the failure.\nDo not guess.';

test('preserves caller text in a delimited task body', () => {
  const prompt = buildDelegationPrompt({ category: 'general', mode: 'read', references: [] }, task);
  assert.match(prompt, /<agybird_user_task>\n/);
  assert.match(prompt, /\n<\/agybird_user_task>$/);
  assert.ok(prompt.includes(task));
});

test('code read mode explicitly prohibits workspace writes', () => {
  const prompt = buildDelegationPrompt({ category: 'code', mode: 'read', references: [] }, task);
  assert.match(prompt, /Do not create, edit, move, or delete files/i);
  assert.match(prompt, /evidence/i);
  assert.doesNotMatch(prompt, /generate_image/);
});

test('code write mode scopes edits and requests verification', () => {
  const prompt = buildDelegationPrompt({ category: 'code', mode: 'write', references: [] }, task);
  assert.match(prompt, /Make only changes required by the user task/i);
  assert.match(prompt, /Run the smallest relevant tests/i);
  assert.match(prompt, /changed files/i);
});

test('image generation requires the built-in generate_image tool', () => {
  const prompt = buildDelegationPrompt({ category: 'image', mode: 'write', references: [] }, 'Draw a blue bird.');
  assert.match(prompt, /built-in `generate_image` tool/i);
  assert.match(prompt, /ImageName/i);
  assert.match(prompt, /return every generated artifact path/i);
});

test('image editing maps absolute references into ImagePaths', () => {
  const references = ['/tmp/source one.png', '/tmp/source-two.jpg'];
  const prompt = buildDelegationPrompt({ category: 'image', mode: 'write', references }, 'Make it red.');
  assert.match(prompt, /ImagePaths/);
  assert.ok(prompt.includes(JSON.stringify(references)));
  assert.match(prompt, /edit the supplied reference image/i);
});

test('general read and write modes have distinct file policies', () => {
  const readPrompt = buildDelegationPrompt({ category: 'general', mode: 'read', references: [] }, task);
  const writePrompt = buildDelegationPrompt({ category: 'general', mode: 'write', references: [] }, task);
  assert.match(readPrompt, /Do not create, edit, move, or delete files/i);
  assert.match(writePrompt, /create or edit only the deliverables requested/i);
});

test('does not inject provider, sandbox, or credit choices', () => {
  const prompt = buildDelegationPrompt({ category: 'code', mode: 'write', references: [] }, task);
  assert.doesNotMatch(prompt, /useG1Credits/);
  assert.doesNotMatch(prompt, /dangerously-skip-permissions/);
  assert.doesNotMatch(prompt, /--sandbox/);
  assert.doesNotMatch(prompt, /--model/);
  assert.doesNotMatch(prompt, /--effort/);
});
