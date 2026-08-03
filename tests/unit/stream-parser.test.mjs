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

test('parses the nested event envelope emitted by agy 1.1.9', () => {
  const parsed = parseFixture('agy-1.1.9.ndjson');

  assert.equal(parsed.conversationId, 'conv-live');
  assert.deepEqual(parsed.response, { summary: 'READY', risks: [] });
  assert.deepEqual(parsed.structuredOutput, { summary: 'READY', risks: [] });
  assert.equal(parsed.agyStatus, 'SUCCESS');
  assert.deepEqual(parsed.usage, { total_tokens: 24 });
  assert.equal(parsed.sawTerminalResult, true);
  assert.equal(classifyOutcome({ parsed, exitCode: 0, stderr: '' }).status, 'success');
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

test('classifies a denial with no derivable allow-rule as blocked despite exit zero', () => {
  const parsed = parseFixture('permission-denied.ndjson');
  const outcome = classifyOutcome({ parsed, exitCode: 0, stderr: '' });
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.warnings.join('\n'), /permission/i);
});

test('classifies nested agy 1.1.9 tool_info permission errors as needing permission', () => {
  const parsed = parseFixture('agy-1.1.9-permission.ndjson');
  const outcome = classifyOutcome({ parsed, exitCode: 0, stderr: '' });

  assert.equal(parsed.toolCalls[0].name, 'run_command');
  assert.equal(parsed.toolCalls[0].status, 'error');
  assert.match(parsed.toolCalls[0].error, /denied permission/i);
  assert.equal(outcome.status, 'needs_permission');
});

test('reports the denied tool, target, and allow-rule captured from live agy 1.1.9', () => {
  const parsed = parseFixture('agy-1.1.9-command-denied.ndjson');
  const outcome = classifyOutcome({ parsed, exitCode: 0, stderr: '' });

  assert.equal(outcome.status, 'needs_permission');
  assert.deepEqual(outcome.permissionRequests.map((request) => ({
    tool: request.tool,
    target: request.target,
    suggested_rule: request.suggested_rule,
    grantable: request.grantable,
  })), [{
    tool: 'run_command',
    target: 'git rev-parse --show-toplevel',
    suggested_rule: 'command(git rev-parse --show-toplevel)',
    grantable: true,
  }]);
  assert.match(outcome.permissionRequests[0].settings_path, /\.gemini[/\\]antigravity-cli[/\\]settings\.json$/);
  assert.match(outcome.warnings.join('\n'), /permissions\.allow/);
});

test('keeps a denial ungrantable when agy states allow-rules do not apply', () => {
  const parsed = parseFixture('agy-1.1.9-command-denied.ndjson');
  const outcome = classifyOutcome({
    parsed,
    exitCode: 0,
    stderr: 'the browser tool(s) required approval that headless mode cannot prompt for, so they were auto-denied. Settings allow-rules do not apply; re-run with --dangerously-skip-permissions to auto-approve all tools.',
  });

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.permissionRequests[0].grantable, false);
});

test('maps the real agy file-writing tools onto write_file allow-rules', () => {
  for (const tool of ['write_to_file', 'replace_file_content', 'multi_replace_file_content']) {
    const parser = createStreamParser();
    parser.push([
      '{"event":"init","conversation_id":"conv-write"}',
      `{"event":"step_update","step_update":{"step_index":1,"state":"ERROR","step_type":"tool","tool_name":"${tool}","tool_info":{"name":"${tool}","parameters":{"TargetFile":"/repo/src/main.ts"},"error":{"type":"TOOL_ERROR","message":"User denied permission to write file"}}}}`,
      '{"event":"result","result":{"status":"SUCCESS","response":""}}',
      '',
    ].join('\n'));
    const outcome = classifyOutcome({ parsed: parser.finish(), exitCode: 0, stderr: '' });

    assert.equal(outcome.status, 'needs_permission', `${tool} must stay grantable`);
    assert.equal(outcome.permissionRequests[0].suggested_rule, 'write_file(/repo/src/main\\.ts)');
  }
});

test('takes the rule from ask_permission when agy requests a grant itself', () => {
  const parser = createStreamParser();
  parser.push([
    '{"event":"init","conversation_id":"conv-ask"}',
    '{"event":"step_update","step_update":{"step_index":8,"state":"DONE","step_type":"tool","tool_name":"ask_permission","tool_info":{"name":"ask_permission","parameters":{"Action":"command","Reason":"Need to run git commands to get the commit hash.","Target":"git"},"error":{"type":"TOOL_ERROR","message":"User denied permission to run command:\\ngit"}}}}',
    '{"event":"result","result":{"status":"SUCCESS","response":""}}',
    '',
  ].join('\n'));
  const outcome = classifyOutcome({ parsed: parser.finish(), exitCode: 0, stderr: '' });

  assert.equal(outcome.status, 'needs_permission');
  assert.equal(outcome.permissionRequests[0].target, 'git');
  assert.equal(outcome.permissionRequests[0].suggested_rule, 'command(git)');
});

test('maps view_file and list_dir denials onto read_file allow-rules', () => {
  const parser = createStreamParser();
  parser.push([
    '{"event":"init","conversation_id":"conv-read"}',
    '{"event":"step_update","step_update":{"step_index":1,"state":"ERROR","step_type":"tool","tool_name":"view_file","tool_info":{"name":"view_file","parameters":{"AbsolutePath":"/repo/src/main.ts"},"error":{"type":"TOOL_ERROR","message":"User denied permission to read file"}}}}',
    '{"event":"result","result":{"status":"SUCCESS","response":""}}',
    '',
  ].join('\n'));
  const outcome = classifyOutcome({ parsed: parser.finish(), exitCode: 0, stderr: '' });

  assert.equal(outcome.status, 'needs_permission');
  assert.equal(outcome.permissionRequests[0].suggested_rule, 'read_file(/repo/src/main\\.ts)');
});

function deniedCommand(commandLine) {
  const parser = createStreamParser();
  parser.push([
    JSON.stringify({ event: 'init', conversation_id: 'conv-long' }),
    JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 1,
        state: 'ERROR',
        step_type: 'tool',
        tool_name: 'run_command',
        tool_info: {
          name: 'run_command',
          parameters: { CommandLine: commandLine },
          error: { type: 'TOOL_ERROR', message: 'User denied permission to run command' },
        },
      },
    }),
    JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '' } }),
    '',
  ].join('\n'));
  return classifyOutcome({ parsed: parser.finish(), exitCode: 0, stderr: '' }).permissionRequests[0];
}

test('suggests a rule that actually matches a multi-line command', () => {
  const command = 'gh pr create --title "T" --body "Line one.\nLine two.\n\n- bullet"';
  const request = deniedCommand(command);

  const target = request.suggested_rule.slice('command('.length, -1);
  assert.ok(
    new RegExp(target).test(command),
    'a rule built from a flattened target can never authorize the command it came from',
  );
});

test('shows a shortened target while keeping the rule complete, and says it did', () => {
  const body = 'x'.repeat(500);
  const command = `gh pr create --body "${body}"`;
  const request = deniedCommand(command);

  assert.equal(request.target.length, 300, 'the rendered target stays bounded');
  assert.equal(request.target_truncated, true, 'the caller is told it is not seeing everything');
  assert.ok(request.suggested_rule.includes(body), 'the rule still covers the whole command');
  assert.equal(request.grantable, true);
});

test('reports a short single-line target as complete', () => {
  const request = deniedCommand('git status');

  assert.equal(request.target, 'git status');
  assert.equal(request.target_truncated, false);
  assert.equal(request.suggested_rule, 'command(git status)');
});

test('withholds a suggestion when the target is too long to review', () => {
  const request = deniedCommand(`gh pr create --body "${'x'.repeat(3000)}"`);

  assert.equal(request.suggested_rule, null, 'no rule is offered that nobody could check');
  assert.equal(request.target_truncated, true);
  assert.equal(request.grantable, true, 'an allow-rule still exists for the action');
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
    'permission_requests',
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
