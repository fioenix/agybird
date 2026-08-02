import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const readJson = (path) => JSON.parse(read(path));

const packageJson = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');

test('the plugin manifest identifies Agybird and stays parseable', () => {
  assert.equal(plugin.name, 'agybird');
  assert.equal(plugin.license, packageJson.license);
  assert.match(plugin.description, /Antigravity/);
  assert.equal(typeof plugin.author?.name, 'string');
  assert.equal(plugin.homepage, plugin.repository);
});

test('the plugin version tracks package.json and a documented changelog entry', () => {
  assert.equal(plugin.version, packageJson.version);
  assert.match(read('CHANGELOG.md'), new RegExp(`^## ${packageJson.version.replace(/\./g, '\\.')} `, 'm'));
});

// Claude Code loads a root SKILL.md as a single-skill plugin only while there is no
// skills/ directory and no skills path in the manifest. Adding either one silently
// stops the root skill from loading, so the layout is asserted rather than assumed.
test('the root skill layout stays the single source of skills', () => {
  assert.equal(existsSync(new URL('SKILL.md', root)), true);
  assert.equal(existsSync(new URL('skills/', root)), false);
  for (const field of ['skills', 'commands']) {
    assert.equal(field in plugin, false, `plugin.json must not declare ${field}`);
  }
});

test('the marketplace lists exactly this repository as the plugin source', () => {
  assert.equal(marketplace.name, 'agybird');
  assert.equal(typeof marketplace.owner?.name, 'string');
  assert.equal(marketplace.plugins.length, 1);
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, plugin.name);
  assert.equal(entry.source, './');
  assert.equal(entry.license, plugin.license);
});

test('README documents the plugin install path alongside the skill install path', () => {
  const readme = read('README.md');
  assert.match(readme, /\/plugin marketplace add fioenix\/agybird/);
  assert.match(readme, /\/plugin install agybird@agybird/);
});
