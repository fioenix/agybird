import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
    const stored = JSON.parse(readFileSync(join(directory, 'sessions.json'), 'utf8'));
    assert.equal(stored[pathToFileURL(workspace).href.replace(/\/$/, '')], 'conv-3', 'the newest id replaces the old one');
    assert.equal(stored[pathToFileURL(other).href.replace(/\/$/, '')], 'conv-2', 'unrelated workspaces survive the write');
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

test('tolerates a corrupt session store instead of failing the run', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    writeSession(workspace, 'conv-1', directory);
    writeFileSync(join(directory, 'sessions.json'), '{not json');
    assert.equal(readSession(workspace, directory), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});
