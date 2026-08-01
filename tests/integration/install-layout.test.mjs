import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distributableFiles = [
  'SKILL.md',
  'scripts/agybird.mjs',
  'references',
  'README.md',
  'LICENSE',
  'SECURITY.md',
];

test('the standalone skill layout contains every referenced local resource', async () => {
  const installRoot = mkdtempSync(join(tmpdir(), 'agybird-install-'));
  for (const path of distributableFiles) {
    cpSync(join(projectRoot, path), join(installRoot, path), { recursive: true });
  }

  const skill = readFileSync(join(installRoot, 'SKILL.md'), 'utf8');
  const references = [...skill.matchAll(/\((references\/[^)]+\.md)\)/g)].map((match) => match[1]);
  assert.ok(references.length >= 6);
  for (const reference of references) {
    assert.equal(existsSync(join(installRoot, reference)), true, `${reference} is missing`);
  }

  const runner = await import(pathToFileURL(join(installRoot, 'scripts', 'agybird.mjs')));
  assert.equal(typeof runner.main, 'function');
  assert.equal(typeof runner.buildAgyArgs, 'function');
});
