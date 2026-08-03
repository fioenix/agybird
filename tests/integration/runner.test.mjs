import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
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

// `skills add` symlinks the whole skill directory into the agent's folder, so an
// installed runner is always reached through a path that is not its real one.
const linkedRoot = mkdtempSync(join(tmpdir(), 'agybird-linked-'));
const linkedSkillPath = join(linkedRoot, 'agybird');
symlinkSync(projectRoot, linkedSkillPath, process.platform === 'win32' ? 'junction' : 'dir');
const linkedRunnerPath = join(linkedSkillPath, 'scripts', 'agybird.mjs');

function runRunner({
  category = 'general',
  mode = 'read',
  prompt = 'CASE_SUCCESS',
  timeout = '5s',
  references = [],
  cwd = mkdtempSync(join(tmpdir(), 'agybird-runner-')),
  extraArgs = [],
  projectsDir = fakeProjects,
  stateDir = fakeState,
  viaSymlink = false,
} = {}) {
  const entry = viaSymlink ? linkedRunnerPath : runnerPath;
  const args = [entry, '--category', category, '--cwd', cwd, '--mode', mode, '--timeout', timeout];
  for (const reference of references) args.push('--reference', reference);
  args.push(...extraArgs);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
        AGYBIRD_PROJECTS_DIR: projectsDir,
        AGYBIRD_STATE_DIR: stateDir,
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

test('removes a once-grant that a killed run left behind, on the next run', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'agybird-killed-'));
  const projects = mkdtempSync(join(tmpdir(), 'agybird-killed-projects-'));
  const state = mkdtempSync(join(tmpdir(), 'agybird-killed-state-'));
  const childEnv = {
    ...process.env,
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
    AGYBIRD_PROJECTS_DIR: projects,
    AGYBIRD_STATE_DIR: state,
  };
  const baseArgs = [runnerPath, '--category', 'general', '--cwd', cwd, '--mode', 'read'];

  // A recorded session, because a grant only applies to a run being resumed.
  await new Promise((resolve, reject) => {
    const first = spawn(process.execPath, [...baseArgs, '--timeout', '5s'], { cwd: projectRoot, env: childEnv, stdio: ['pipe', 'ignore', 'ignore'] });
    first.on('error', reject);
    first.on('close', resolve);
    first.stdin.end('CASE_SUCCESS');
  });

  const projectPath = join(projects, readdirSync(projects)[0]);
  const grantArgs = [...baseArgs, '--timeout', '30s', '--grant', 'command(git status)', '--grant-scope', 'once'];
  const killed = spawn(process.execPath, grantArgs, { cwd: projectRoot, env: childEnv, stdio: ['pipe', 'ignore', 'ignore'] });
  killed.stdin.end('CASE_DELAY');

  // Wait until the grant is actually on disk, then kill without warning.
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = setInterval(() => {
      if (/git status/.test(readFileSync(projectPath, 'utf8'))) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error('the grant was never written'));
      }
    }, 25);
  });
  const exited = new Promise((resolve) => killed.on('close', resolve));
  killed.kill('SIGKILL');
  await exited;

  assert.match(
    readFileSync(projectPath, 'utf8'),
    /git status/,
    'SIGKILL cannot run cleanup, so the rule is still on disk',
  );

  const recovery = await runRunner({ cwd, prompt: 'CASE_SUCCESS', projectsDir: projects, stateDir: state });
  const envelope = parseSingleEnvelope(recovery.stdout);

  assert.doesNotMatch(
    readFileSync(projectPath, 'utf8'),
    /git status/,
    'the next run removes the abandoned rule',
  );
  assert.match(envelope.warnings.join('\n'), /one-time allow-rule/i, 'and says so');
});

// The whole point of these is the entry path, not the category logic: reached
// through a symlink the runner used to exit 0 with no output at all, so each
// category is checked for an envelope rather than silence.
for (const category of ['general', 'code']) {
  test(`runs category ${category} through a symlinked path, the way the skill is installed`, async () => {
    const result = await runRunner({ category, viaSymlink: true });

    assert.notEqual(result.stdout.trim(), '', 'a symlinked runner must not exit silently');
    const envelope = parseSingleEnvelope(result.stdout);
    assert.equal(result.exitCode, 0);
    assert.equal(envelope.status, 'success');
    assert.equal(envelope.category, category);
  });
}

test('runs category image through a symlinked path and still verifies the artifact', async () => {
  const result = await runRunner({
    category: 'image',
    mode: 'write',
    prompt: 'CASE_IMAGE_SUCCESS',
    viaSymlink: true,
  });

  assert.notEqual(result.stdout.trim(), '', 'a symlinked runner must not exit silently');
  const envelope = parseSingleEnvelope(result.stdout);
  assert.equal(result.exitCode, 0);
  assert.equal(envelope.status, 'success');
  assert.equal(envelope.category, 'image');
  // Artifact containment resolves real paths, so it has to hold when the runner
  // itself was reached through one that is not real.
  assert.equal(envelope.artifacts.length, 1);
  assert.equal(envelope.artifacts[0].path, realpathSync(join(result.cwd, 'generated.png')));
});

test('reports a failure through a symlinked path instead of exiting silently', async () => {
  const result = await runRunner({ category: 'general', prompt: 'CASE_NONZERO', viaSymlink: true });

  assert.notEqual(result.stdout.trim(), '', 'a failing run must still produce an envelope');
  assert.equal(result.exitCode, 1);
  assert.equal(parseSingleEnvelope(result.stdout).status, 'error');
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
