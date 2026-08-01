#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.AGYBIRD_LIVE_CONFIRM !== '1') {
  process.stderr.write('Refusing a paid live call. Set AGYBIRD_LIVE_CONFIRM=1 after confirming Antigravity credit use.\n');
  process.exit(2);
}

const runner = join(dirname(fileURLToPath(import.meta.url)), 'agybird.mjs');
const child = spawn(process.execPath, [runner, ...process.argv.slice(2)], {
  env: process.env,
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
});

process.stdin.pipe(child.stdin);
let stdout = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
child.stderr.pipe(process.stderr);

child.on('error', (error) => {
  process.stderr.write(`Live runner failed to start: ${error.message}\n`);
  process.exit(1);
});

child.on('close', () => {
  let envelope;
  try {
    const lines = stdout.trim().split('\n');
    if (lines.length !== 1) throw new Error(`expected one envelope, received ${lines.length}`);
    envelope = JSON.parse(lines[0]);
  } catch (error) {
    process.stderr.write(`Invalid live runner output: ${error.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(envelope)}\n`);
  if (envelope.status !== 'success') process.exit(1);
  if (envelope.category === 'image' && envelope.artifacts.length === 0) process.exit(1);
});
