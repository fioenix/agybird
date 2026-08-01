import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('has valid minimal Agent Skill frontmatter and explicit-only triggers', () => {
  const skill = read('SKILL.md');
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1];
  assert.ok(frontmatter, 'missing YAML frontmatter');
  assert.match(frontmatter, /^name: agybird$/m);
  assert.match(frontmatter, /^description: .+$/m);
  assert.match(frontmatter, /^compatibility: .+$/m);
  assert.match(frontmatter, /explicitly/i);
  assert.match(frontmatter, /Antigravity CLI|agy/);
  assert.match(frontmatter, /Do not use|not trigger/i);
});

test('routes all three categories through progressive-disclosure references', () => {
  const skill = read('SKILL.md');
  for (const category of ['code', 'image', 'general']) {
    assert.match(skill, new RegExp(`references/${category}\\.md`));
    assert.ok(read(`references/${category}.md`).length > 100);
  }
  for (const reference of ['common', 'security', 'troubleshooting']) {
    assert.match(skill, new RegExp(`references/${reference}\\.md`));
    assert.ok(read(`references/${reference}.md`).length > 100);
  }
});

test('requires prompt-via-stdin invocation and preserves provider controls', () => {
  const common = read('references/common.md');
  assert.match(common, /standard input|stdin/i);
  assert.match(common, /scripts\/agybird\.mjs/);
  assert.match(common, /useG1Credits/);
  assert.match(common, /do not (?:change|modify)/i);
  assert.match(common, /--dangerously-skip-permissions/);
  assert.match(common, /never/i);
});

test('documents confirm-before-install and cached-auth recovery', () => {
  const troubleshooting = read('references/troubleshooting.md');
  assert.match(troubleshooting, /ask.*confirm|confirmation/i);
  assert.match(troubleshooting, /curl -fsSL https:\/\/antigravity\.google\/cli\/install\.sh \| bash/);
  assert.match(troubleshooting, /irm https:\/\/antigravity\.google\/cli\/install\.ps1 \| iex/);
  assert.match(troubleshooting, /interactive `agy`|run `agy` interactively/i);
  assert.match(troubleshooting, /cached/i);
});

test('requires independent code and image verification', () => {
  const code = read('references/code.md');
  const image = read('references/image.md');
  assert.match(code, /git diff/i);
  assert.match(code, /untracked/i);
  assert.match(code, /rerun|run.*test/i);
  assert.match(image, /artifact/i);
  assert.match(image, /nonempty|non-empty/i);
  assert.match(image, /visually|visual/i);
  assert.match(image, /ImagePaths/);
});

test('links the relevant official Antigravity documentation', () => {
  const combined = [
    read('SKILL.md'),
    ...['common', 'code', 'image', 'general', 'security', 'troubleshooting'].map((name) => read(`references/${name}.md`)),
  ].join('\n');
  for (const path of ['overview', 'install', 'headless', 'best-practices', 'artifacts', 'credits', 'plugins', 'sandbox']) {
    assert.match(combined, new RegExp(`https://antigravity\\.google/docs/cli/${path}`));
  }
});

test('states the unofficial status and policy boundary', () => {
  const security = read('references/security.md');
  assert.match(security, /unofficial/i);
  assert.match(security, /not affiliated with Google/i);
  assert.match(security, /no legal safe harbor/i);
  assert.match(security, /does not bypass/i);
});
