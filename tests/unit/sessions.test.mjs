import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import {
  parseArgs,
  readSession,
  resolveSession,
  validateRequest,
  writeSession,
} from '../../scripts/agybird.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'agybird-sessions-'));
}

test('records a conversation per workspace and reads it back', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  const other = temporaryDirectory();
  try {
    assert.equal(readSession(workspace, directory), null, 'an unknown workspace has no session');

    writeSession(workspace, 'conv-1', directory);
    assert.equal(readSession(workspace, directory), 'conv-1');
    assert.equal(readSession(other, directory), null, 'sessions do not leak across workspaces');

    writeSession(other, 'conv-2', directory);
    writeSession(workspace, 'conv-3', directory);
    assert.equal(readSession(workspace, directory), 'conv-3', 'the newest id replaces the old one');
    assert.equal(readSession(other, directory), 'conv-2', 'unrelated workspaces survive the write');

    assert.equal(readdirSync(join(directory, 'sessions')).length, 2, 'one file per workspace, never a shared map');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('resumes the recorded session by default so continuity is not left to the caller', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    const options = validateRequest(parseArgs(['--category', 'code', '--cwd', workspace]));
    assert.equal(resolveSession(options, directory), null, 'nothing to resume on the first run');

    writeSession(workspace, 'conv-1', directory);
    assert.equal(resolveSession(options, directory), 'conv-1', 'a later run resumes without being told to');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('lets an explicit conversation or a new session override the record', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    writeSession(workspace, 'conv-stored', directory);

    const explicit = validateRequest(parseArgs([
      '--category', 'code', '--cwd', workspace, '--conversation', 'conv-explicit',
    ]));
    assert.equal(resolveSession(explicit, directory), 'conv-explicit');

    const fresh = validateRequest(parseArgs(['--category', 'code', '--cwd', workspace, '--new-session']));
    assert.equal(resolveSession(fresh, directory), null);
    assert.equal(readSession(workspace, directory), 'conv-stored', 'asking for a new session does not erase the record');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('rejects flag combinations that contradict session continuity', () => {
  const base = ['--category', 'code', '--cwd', process.cwd()];
  assert.throws(
    () => validateRequest(parseArgs([...base, '--new-session', '--conversation', 'conv-1'])),
    /--new-session cannot be combined with --conversation/,
  );
  assert.throws(
    () => validateRequest(parseArgs([...base, '--new-session', '--grant', 'command(git status)'])),
    /--grant cannot be combined with --new-session/,
  );
});

test('accepts a grant without a hand-threaded conversation id', () => {
  const options = validateRequest(parseArgs([
    '--category', 'code', '--cwd', process.cwd(), '--grant', 'command(git status)',
  ]));
  assert.deepEqual(options.grants, ['command(git status)']);
  assert.equal(options.conversation, undefined);
});

test('treats an unreadable record as no session rather than failing the run', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  const other = temporaryDirectory();
  try {
    const path = writeSession(workspace, 'conv-1', directory);
    writeSession(other, 'conv-other', directory);
    writeFileSync(path, '{not json');

    assert.equal(readSession(workspace, directory), null);
    assert.equal(
      readSession(other, directory),
      'conv-other',
      'one damaged record cannot cost another workspace its session',
    );

    writeSession(workspace, 'conv-2', directory);
    assert.equal(readSession(workspace, directory), 'conv-2', 'the next run simply records its own');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('ignores a record that belongs to a different workspace', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    const path = writeSession(workspace, 'conv-1', directory);
    writeFileSync(path, JSON.stringify({ workspace: 'file:///somewhere/else', conversation: 'conv-theirs' }));

    assert.equal(readSession(workspace, directory), null, 'a digest collision must not hand over another session');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('treats a symlinked workspace as the same session as its real path', () => {
  const directory = temporaryDirectory();
  const real = temporaryDirectory();
  const link = join(temporaryDirectory(), 'alias');
  try {
    // A directory symlink needs elevated rights on Windows; a junction does not.
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    writeSession(real, 'conv-1', directory);
    assert.equal(readSession(link, directory), 'conv-1', 'the spelling of the path must not lose the session');

    writeSession(link, 'conv-2', directory);
    assert.equal(
      readdirSync(join(directory, 'sessions')).length,
      1,
      'one directory holds one record, not one per spelling',
    );
    assert.equal(readSession(real, directory), 'conv-2');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

test('leaves no temporary file behind after recording a session', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    const path = writeSession(workspace, 'conv-1', directory);
    assert.deepEqual(readdirSync(join(directory, 'sessions')), [basename(path)]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});
