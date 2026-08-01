#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
assert.deepEqual(packageJson.dependencies ?? {}, {}, 'runtime dependencies must remain empty');
assert.deepEqual(packageJson.optionalDependencies ?? {}, {}, 'optional runtime dependencies must remain empty');
assert.equal(packageJson.private, true, 'the npm package must remain private');

const runner = await import(new URL('./agybird.mjs', import.meta.url));
const safeArgs = runner.buildAgyArgs({ mode: 'read', timeout: '1m' }, 'contract check');
assert.equal(safeArgs.includes('--dangerously-skip-permissions'), false);
assert.equal(safeArgs.includes('--sandbox'), false);

const placeholderTargets = [
  'SKILL.md',
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  'references/common.md',
  'references/code.md',
  'references/image.md',
  'references/general.md',
  'references/security.md',
  'references/troubleshooting.md',
  'docs/threat-model.md',
];
for (const path of placeholderTargets) {
  const content = readFileSync(join(projectRoot, path), 'utf8');
  assert.doesNotMatch(content, /\b(?:TODO|TBD|FIXME|YOUR_)\b/, `${path} contains a placeholder`);
}

run(process.execPath, ['--test', 'tests/**/*.test.mjs']);
run('git', ['diff', '--check']);
process.stdout.write('Agybird checks passed.\n');
