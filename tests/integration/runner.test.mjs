import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDirectory, '..', '..');
const runnerPath = join(projectRoot, 'scripts', 'agybird.mjs');
const fakeAgyPath = join(projectRoot, 'tests', 'fixtures', 'fake-agy.mjs');
const fakeBin = mkdtempSync(join(tmpdir(), 'agybird-fake-bin-'));
// Keep the runner's workspace-project bookkeeping out of the real Antigravity config.
const fakeProjects = mkdtempSync(join(tmpdir(), 'agybird-fake-projects-'));
const fakeState = mkdtempSync(join(tmpdir(), 'agybird-fake-state-'));
const fakeCommandPath = join(fakeBin, 'agy');
copyFileSync(fakeAgyPath, fakeCommandPath);
chmodSync(fakeCommandPath, 0o755);

function runRunner({
  category = 'general',
  mode = 'read',
  prompt = 'CASE_SUCCESS',
  timeout = '5s',
  references = [],
  cwd = mkdtempSync(join(tmpdir(), 'agybird-runner-')),
  extraArgs = [],
} = {}) {
  const args = [runnerPath, '--category', category, '--cwd', cwd, '--mode', mode, '--timeout', timeout];
  for (const reference of references) args.push('--reference', reference);
  args.push(...extraArgs);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
        AGYBIRD_PROJECTS_DIR: fakeProjects,
        AGYBIRD_STATE_DIR: fakeState,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ cwd, stdout, stderr, exitCode }));
    child.stdin.end(prompt);
  });
}

function parseSingleEnvelope(stdout) {
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 1, `expected one stdout line, received ${lines.length}`);
  return JSON.parse(lines[0]);
}

test('runs fake agy through a real child process and emits one success envelope', async () => {
  const result = await runRunner();
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'success');
  assert.equal(envelope.response, 'ok');
  assert.equal(envelope.evidence.agy_version, 'agy 0.0.0-fake');
  assert.match(envelope.evidence.agy_binary, /agy(?:\.cmd)?$/i);
  assert.equal(result.stderr, '');
});

test('reports zero-exit permission denial as blocked', async () => {
  const result = await runRunner({ prompt: 'CASE_BLOCKED' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'blocked');
  assert.match(envelope.warnings.join('\n'), /permission/i);
  assert.match(result.stderr, /diagnostics/i);
  assert.doesNotMatch(result.stderr, /Permission denied by current policy/);
});

test('reports provider nonzero exit as error and exits nonzero', async () => {
  const result = await runRunner({ prompt: 'CASE_NONZERO' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(envelope.status, 'error');
  assert.equal(envelope.evidence.agy_exit_code, 7);
});

test('recovers from malformed provider output with a sanitized warning', async () => {
  const result = await runRunner({ prompt: 'CASE_MALFORMED' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'success');
  assert.match(envelope.warnings.join('\n'), /Malformed stream event/);
  assert.doesNotMatch(result.stdout, /not-json/);
});

test('terminates a delayed provider process at the requested timeout', async () => {
  const startedAt = Date.now();
  const result = await runRunner({ prompt: 'CASE_DELAY', timeout: '50ms' });
  const elapsed = Date.now() - startedAt;
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(envelope.status, 'error');
  assert.match(envelope.warnings.join('\n'), /timed out/i);
  assert.ok(elapsed < 1_500, `timeout took ${elapsed}ms`);
});

test('accepts image success only with completed tool event and real artifact', async () => {
  const result = await runRunner({ category: 'image', mode: 'write', prompt: 'CASE_IMAGE_SUCCESS' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'success');
  assert.equal(envelope.tool_calls[0].name, 'generate_image');
  assert.equal(envelope.tool_calls[0].status, 'completed');
  assert.equal(envelope.artifacts.length, 1);
  assert.equal(envelope.artifacts[0].path, realpathSync(join(result.cwd, 'generated.png')));
  assert.equal(envelope.artifacts[0].size, 8);
});

test('downgrades completed image tool calls when their artifact is missing', async () => {
  const result = await runRunner({ category: 'image', mode: 'write', prompt: 'CASE_IMAGE_MISSING' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(envelope.status, 'error');
  assert.match(envelope.warnings.join('\n'), /artifact/i);
});

test('keeps failed image tool calls partial when a terminal response exists', async () => {
  const result = await runRunner({ category: 'image', mode: 'write', prompt: 'CASE_IMAGE_FAILURE' });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'partial');
  assert.equal(envelope.artifacts.length, 0);
});

test('resumes the same conversation on a later run in the same workspace', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'agybird-continuity-'));

  const first = await runRunner({ prompt: 'CASE_ECHO_CONVERSATION', cwd });
  const firstEnvelope = parseSingleEnvelope(first.stdout);
  assert.equal(firstEnvelope.response, 'none', 'the first run starts a conversation');
  assert.equal(firstEnvelope.evidence.session_resumed, false);
  assert.equal(firstEnvelope.conversation_id, 'fake-conversation');

  const second = await runRunner({ prompt: 'CASE_ECHO_CONVERSATION', cwd });
  const secondEnvelope = parseSingleEnvelope(second.stdout);
  assert.equal(
    secondEnvelope.response,
    'fake-conversation',
    'the runner resumes without the caller threading the id back',
  );
  assert.equal(secondEnvelope.evidence.session_resumed, true);

  const fresh = await runRunner({ prompt: 'CASE_ECHO_CONVERSATION', cwd, extraArgs: ['--new-session'] });
  const freshEnvelope = parseSingleEnvelope(fresh.stdout);
  assert.equal(freshEnvelope.response, 'none', '--new-session starts over on purpose');
  assert.equal(freshEnvelope.evidence.session_resumed, false);
});

test('refuses a grant when no session was ever recorded for the workspace', async () => {
  const result = await runRunner({ extraArgs: ['--grant', 'command(git status)'] });
  const envelope = parseSingleEnvelope(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(envelope.status, 'error');
  assert.match(envelope.warnings.join('\n'), /needs a session to resume/);
});

test('validates an absolute reference image before process execution', async () => {
  const referenceRoot = mkdtempSync(join(tmpdir(), 'agybird-reference-'));
  const reference = join(referenceRoot, 'reference.png');
  writeFileSync(reference, 'reference');

  const result = await runRunner({
    category: 'image',
    mode: 'write',
    prompt: 'CASE_IMAGE_SUCCESS',
    references: [reference],
  });
  assert.equal(parseSingleEnvelope(result.stdout).status, 'success');
});
