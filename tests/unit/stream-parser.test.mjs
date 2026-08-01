import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  classifyOutcome,
  createStreamParser,
  makeEnvelope,
} from '../../scripts/agybird.mjs';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'streams');

function parseFixture(name) {
  const parser = createStreamParser();
  parser.push(readFileSync(join(fixtureDirectory, name), 'utf8'));
  return parser.finish();
}

test('parses init, tool progress, terminal result, response, and usage', () => {
  const parsed = parseFixture('success.ndjson');

  assert.equal(parsed.conversationId, 'conv-success');
  assert.equal(parsed.response, 'Inspection complete.');
  assert.deepEqual(parsed.usage, { input_tokens: 12, output_tokens: 4 });
  assert.equal(parsed.sawTerminalResult, true);
  assert.deepEqual(parsed.toolCalls, [{
    id: 'tool-1',
    name: 'read_file',
    status: 'completed',
    arguments: { path: 'README.md' },
    result: { path: 'README.md' },
  }]);
});

test('handles chunks split across NDJSON boundaries', () => {
  const parser = createStreamParser();
  parser.push('{"type":"init","conversation_id":"conv-chunk"}\n{"type":"res');
  parser.push('ult","status":"success","response":"done"}\n');
  const parsed = parser.finish();

  assert.equal(parsed.conversationId, 'conv-chunk');
  assert.equal(parsed.response, 'done');
  assert.equal(parsed.warnings.length, 0);
});

test('records malformed lines as sanitized warnings and recovers', () => {
  const parsed = parseFixture('malformed.ndjson');

  assert.equal(parsed.response, 'Recovered.');
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /Malformed stream event at line 2/);
  assert.doesNotMatch(parsed.warnings[0], /this is not json/);
});

test('classifies explicit permission denial as blocked despite exit zero', () => {
  const parsed = parseFixture('permission-denied.ndjson');
  const outcome = classifyOutcome({ parsed, exitCode: 0, stderr: '' });
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.warnings.join('\n'), /permission/i);
});

test('classifies permission denial from stderr as blocked despite exit zero', () => {
  const parsed = parseFixture('success.ndjson');
  const outcome = classifyOutcome({
    parsed,
    exitCode: 0,
    stderr: 'Tool was not executed: permission denied by current policy',
  });
  assert.equal(outcome.status, 'blocked');
});

test('classifies tool failure as partial when a terminal response exists', () => {
  const parsed = parseFixture('tool-error.ndjson');
  assert.equal(classifyOutcome({ parsed, exitCode: 0, stderr: '' }).status, 'partial');
});

test('classifies nonzero exits and missing terminal results as errors', () => {
  const success = parseFixture('success.ndjson');
  assert.equal(classifyOutcome({ parsed: success, exitCode: 2, stderr: 'failed' }).status, 'error');

  const parser = createStreamParser();
  parser.push('{"type":"init","conversation_id":"unfinished"}\n');
  const unfinished = parser.finish();
  assert.equal(classifyOutcome({ parsed: unfinished, exitCode: 0, stderr: '' }).status, 'error');
});

test('creates the stable public envelope without raw stream events', () => {
  const parsed = parseFixture('success.ndjson');
  const outcome = classifyOutcome({ parsed, exitCode: 0, stderr: '' });
  const envelope = makeEnvelope({ category: 'general', parsed, outcome, exitCode: 0 });

  assert.deepEqual(Object.keys(envelope), [
    'schema_version',
    'status',
    'category',
    'conversation_id',
    'response',
    'tool_calls',
    'artifacts',
    'warnings',
    'usage',
    'evidence',
  ]);
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.status, 'success');
  assert.equal(envelope.category, 'general');
  assert.equal(envelope.evidence.agy_exit_code, 0);
  assert.equal(envelope.evidence.agy_status, 'success');
  assert.equal('events' in envelope, false);
});
