import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  applyGrants,
  ensureProject,
  findProjectForWorkspace,
  parseArgs,
  parseGrantRule,
  revertGrants,
  validateRequest,
} from '../../scripts/agybird.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'agybird-grants-'));
}

test('accepts the allow-rule kinds agy 1.1.9 recognizes', () => {
  assert.deepEqual(parseGrantRule('command(git rev-parse)'), { kind: 'command', target: 'git rev-parse' });
  assert.deepEqual(parseGrantRule('read_file(/repo/src)'), { kind: 'read_file', target: '/repo/src' });
  assert.deepEqual(parseGrantRule('mcp(obsidian/obsidian_get_note)'), { kind: 'mcp', target: 'obsidian/obsidian_get_note' });
});

test('rejects malformed, unknown, and overly broad allow-rules', () => {
  assert.throws(() => parseGrantRule('git rev-parse'), /Invalid allow-rule/);
  assert.throws(() => parseGrantRule('shell(rm -rf)'), /Unsupported allow-rule kind/);
  assert.throws(() => parseGrantRule('command(*)'), /too broad/);
  assert.throws(() => parseGrantRule('read_file(/)'), /too broad/);
});

test('accepts a grant against the session being resumed', () => {
  const accepted = validateRequest(parseArgs([
    '--category', 'code', '--cwd', process.cwd(),
    '--grant', 'command(git status)',
    '--conversation', 'conv-1',
  ]));
  assert.deepEqual(accepted.grants, ['command(git status)']);
  assert.equal(accepted.grantScope, 'once');
});

test('rejects an unknown grant scope', () => {
  assert.throws(
    () => validateRequest(parseArgs([
      '--category', 'code', '--cwd', process.cwd(),
      '--conversation', 'conv-1',
      '--grant', 'command(git status)',
      '--grant-scope', 'forever',
    ])),
    /Invalid grant scope/,
  );
});

test('creates a workspace project once and reuses it afterwards', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  try {
    const created = ensureProject(workspace, directory);
    const document = JSON.parse(readFileSync(created.path, 'utf8'));

    assert.equal(document.id, created.id);
    assert.equal(
      document.projectResources.resources[0].gitFolder.folderUri,
      pathToFileURL(workspace).href.replace(/\/$/, ''),
    );
    assert.equal(document.permissionGrants, undefined, 'a fresh project carries no grants');

    assert.deepEqual(ensureProject(workspace, directory), created, 'the project is not recreated');
    assert.equal(findProjectForWorkspace(workspace, directory).path, created.path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('recognizes a non-git project recorded as a plain folderUri', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  const projectPath = join(directory, 'plain.json');
  writeFileSync(projectPath, JSON.stringify({
    id: 'plain',
    name: 'plain',
    projectResources: { resources: [{ folderUri: pathToFileURL(workspace).href }] },
  }, null, 1));

  try {
    assert.equal(findProjectForWorkspace(workspace, directory)?.path, projectPath);
    assert.equal(ensureProject(workspace, directory).id, 'plain', 'no duplicate project is created');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('adds grants to the workspace project and restores its exact prior content', () => {
  const directory = temporaryDirectory();
  const workspace = temporaryDirectory();
  const projectPath = join(directory, 'existing.json');
  const original = JSON.stringify({
    id: 'existing',
    name: 'existing',
    projectResources: { resources: [{ gitFolder: { folderUri: pathToFileURL(workspace).href } }] },
    permissionGrants: { permissionGrants: { allow: ['command(ls)'] } },
  }, null, 1);
  writeFileSync(projectPath, original);

  try {
    assert.equal(ensureProject(workspace, directory).path, projectPath);
    const state = applyGrants(projectPath, ['command(ls)', 'read_file(/repo/README.md)']);

    const written = JSON.parse(readFileSync(projectPath, 'utf8'));
    assert.deepEqual(
      written.permissionGrants.permissionGrants.allow,
      ['command(ls)', 'read_file(/repo/README.md)'],
      'an already-present rule is not duplicated',
    );

    revertGrants(state);
    assert.equal(readFileSync(projectPath, 'utf8'), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});
