import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('live wrapper refuses provider calls without explicit credit confirmation', () => {
  const env = { ...process.env };
  delete env.AGYBIRD_LIVE_CONFIRM;
  const result = spawnSync(process.execPath, [join(projectRoot, 'scripts', 'live-test.mjs')], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing a paid live call/);
  assert.equal(result.stdout, '');
});
