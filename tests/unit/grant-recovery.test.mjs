import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyGrants,
  clearGrantJournal,
  journalGrant,
  recoverAbandonedGrants,
} from '../../scripts/agybird.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'agybird-recovery-'));
}

function projectFile(directory, allow = []) {
  const path = join(directory, 'project.json');
  writeFileSync(path, JSON.stringify({
    id: 'project',
    name: 'project',
    permissionGrants: { permissionGrants: { allow } },
  }, null, 1));
  return path;
}

const dead = () => false;
const alive = () => true;

test('undoes a grant whose run was killed before it could clean up', () => {
  const state = temporaryDirectory();
  const projects = temporaryDirectory();
  try {
    const path = projectFile(projects, ['command(ls)']);
    const original = readFileSync(path, 'utf8');

    journalGrant({ path, previous: original }, state);
    applyGrants(path, ['command(git push)']);
    assert.match(readFileSync(path, 'utf8'), /git push/, 'the grant is on disk while the run holds it');

    const warnings = recoverAbandonedGrants(state, dead);

    assert.equal(readFileSync(path, 'utf8'), original, 'the project file is restored byte for byte');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /one-time allow-rule/i, 'the recovery is reported, not silent');
    assert.deepEqual(readdirSync(state), [], 'the journal is consumed');
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(projects, { recursive: true, force: true });
  }
});

test('leaves a journal alone while its run is still going', () => {
  const state = temporaryDirectory();
  const projects = temporaryDirectory();
  try {
    const path = projectFile(projects);
    journalGrant({ path, previous: readFileSync(path, 'utf8') }, state);
    applyGrants(path, ['command(git push)']);

    assert.deepEqual(recoverAbandonedGrants(state, alive), []);
    assert.match(readFileSync(path, 'utf8'), /git push/, 'a live run keeps the grant it is using');
    assert.equal(readdirSync(state).length, 1, 'its journal survives for its own cleanup');
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(projects, { recursive: true, force: true });
  }
});

test('clears the journal when the run cleans up normally', () => {
  const state = temporaryDirectory();
  const projects = temporaryDirectory();
  try {
    const path = projectFile(projects);
    clearGrantJournal(journalGrant({ path, previous: readFileSync(path, 'utf8') }, state));

    assert.deepEqual(readdirSync(state), []);
    assert.deepEqual(recoverAbandonedGrants(state, dead), [], 'nothing is left to recover');
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(projects, { recursive: true, force: true });
  }
});

test('survives a missing state directory, an unrelated file, and a corrupt journal', () => {
  const state = temporaryDirectory();
  try {
    assert.deepEqual(recoverAbandonedGrants(join(state, 'absent'), dead), []);

    writeFileSync(join(state, 'sessions.json'), '{}');
    writeFileSync(join(state, 'pending-grant-999999.json'), '{not json');
    assert.deepEqual(recoverAbandonedGrants(state, dead), [], 'an unusable journal is discarded quietly');
    assert.deepEqual(readdirSync(state), ['sessions.json'], 'unrelated state is untouched');
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('reports rather than throws when the recorded project can no longer be written', () => {
  const state = temporaryDirectory();
  const projects = temporaryDirectory();
  try {
    journalGrant({ path: join(projects, 'gone', 'project.json'), previous: '{}' }, state);
    const warnings = recoverAbandonedGrants(state, dead);

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Could not remove/);
    assert.equal(readdirSync(state).length, 1, 'the journal is kept so a later run can retry');
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(projects, { recursive: true, force: true });
  }
});
