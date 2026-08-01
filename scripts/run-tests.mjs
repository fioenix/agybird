#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scope = process.argv[2] ?? 'all';
if (!['all', 'unit', 'integration'].includes(scope)) {
  process.stderr.write(`Unknown test scope: ${scope}\n`);
  process.exit(2);
}

function collectTests(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTests(path, files);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(path);
  }
  return files;
}

const testRoot = join(projectRoot, 'tests', scope === 'all' ? '' : scope);
const files = collectTests(testRoot).sort();
if (files.length === 0) {
  process.stderr.write(`No ${scope} tests found.\n`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
