import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function assertPinnedActions(workflow) {
  const uses = [...workflow.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0, 'workflow has no actions');
  for (const action of uses) {
    assert.match(action, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/, `${action} is not pinned by full SHA`);
  }
}

test('CI uses immutable actions and least-privilege permissions', () => {
  const workflow = read('.github/workflows/ci.yml');
  assertPinnedActions(workflow);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\.|AGYBIRD_AGY_BIN|GOOGLE_|GEMINI_|ANTIGRAVITY_/);
});

test('CI covers supported systems and Node versions', () => {
  const workflow = read('.github/workflows/ci.yml');
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.match(workflow, new RegExp(os));
  }
  assert.match(workflow, /node:\s*\[20, 22\]/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
});

test('release workflow validates tags before a least-privilege release', () => {
  const workflow = read('.github/workflows/release.yml');
  assertPinnedActions(workflow);
  assert.match(workflow, /tags:\n\s+- ['"]v\*['"]/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^\s+permissions:\n\s+contents: write$/m);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\.(?!GITHUB_TOKEN)/);
});
