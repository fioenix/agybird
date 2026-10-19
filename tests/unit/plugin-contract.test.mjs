import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const readJson = (path) => JSON.parse(read(path));

const packageJson = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const codexPlugin = readJson('.codex-plugin/plugin.json');
const codexMarketplace = readJson('.agents/plugins/marketplace.json');
const frontmatter = (path) => /^---\n([\s\S]*?)\n---/.exec(read(path))?.[1] ?? '';
const field = (path, name) => new RegExp(`^${name}: (.+)$`, 'm').exec(frontmatter(path))?.[1];
const policyUrls = {
  homepage: 'https://github.com/fioenix/agybird',
  support: 'https://github.com/fioenix/agybird/issues',
  privacy: 'https://github.com/fioenix/agybird/blob/main/PRIVACY.md',
  terms: 'https://github.com/fioenix/agybird/blob/main/TERMS.md',
};

// Codex reads every icon path relative to the plugin root and requires the "./" prefix.
function assertAsset(path) {
  assert.match(path, /^\.\/assets\/[\w.-]+\.(?:svg|png)$/, `${path} is not a ./assets/ path`);
  assert.equal(existsSync(new URL(path, root)), true, `${path} is missing`);
}

test('the plugin manifest identifies Agybird and stays parseable', () => {
  assert.equal(plugin.name, 'agybird');
  assert.equal(plugin.license, packageJson.license);
  assert.match(plugin.description, /Antigravity/);
  assert.equal(typeof plugin.author?.name, 'string');
  assert.equal(plugin.homepage, plugin.repository);
});

test('both plugin versions track package.json and a documented changelog entry', () => {
  assert.equal(plugin.version, packageJson.version);
  assert.equal(codexPlugin.version, packageJson.version);
  assert.equal(readJson('package-lock.json').version, packageJson.version);
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

test('the Claude Code manifest carries the icon and policy links', () => {
  assertAsset(plugin.icon);
  assert.equal(plugin.supportUrl, policyUrls.support);
  assert.equal(plugin.privacyPolicyUrl, policyUrls.privacy);
  assert.equal(plugin.termsOfServiceUrl, policyUrls.terms);
  assert.match(plugin.documentationUrl, /^https:\/\/github\.com\/fioenix\/agybird/);
});

test('the Codex manifest describes the same plugin as the Claude Code manifest', () => {
  for (const key of ['name', 'description', 'homepage', 'repository', 'license']) {
    assert.equal(codexPlugin[key], plugin[key], `.codex-plugin/plugin.json ${key} differs`);
  }
  assert.deepEqual(codexPlugin.author, plugin.author);
  assert.deepEqual(codexPlugin.keywords, plugin.keywords);
  assert.deepEqual(marketplace.plugins[0].keywords, plugin.keywords);
  assert.equal(marketplace.plugins[0].description, plugin.description);
  assert.equal('$schema' in codexPlugin, false, 'the Codex format omits $schema');
  // The runner spawns a local agy process, so the Codex directory must list it as Desktop only.
  assert.equal(codexPlugin.requires_local_executor, true);
});

// Listing rules from the Claude directory pre-submission checklist and the Codex submission page.
test('the listing meets both directories\' naming, contrast, and content rules', () => {
  assert.match(plugin.name, /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
  for (const field of ['icon', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl']) {
    assert.equal(field in marketplace.plugins[0], false, `${field} belongs in plugin.json only`);
  }
  for (const url of [plugin.supportUrl, plugin.privacyPolicyUrl, plugin.termsOfServiceUrl, plugin.documentationUrl]) {
    assert.match(url, /^https:\/\//);
  }

  const luminance = (hex) => {
    const channel = (offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  assert.ok(contrast(codexPlugin.interface.brandColor, '#FFFFFF') >= 2);
  assert.ok(contrast(codexPlugin.interface.brandColorDark, '#212121') >= 2);

  const readme = read('README.md');
  const prose = readme.replace(/```[\s\S]*?```/g, '');
  assert.ok(prose.split(/\s+/).filter(Boolean).length >= 40, 'README needs 40 words outside code blocks');
  const use = readme.slice(readme.indexOf('## Use'), readme.indexOf('\n## ', readme.indexOf('## Use') + 1));
  assert.ok((use.match(/```text\n/g) ?? []).length >= 3, 'README needs three example prompts');
  assert.match(readme, /## Data and network/);
});

// Codex 0.163 does not discover a SKILL.md at the plugin root, so its manifest points at a
// thin adapter that defers to the root skill. The adapter must never become a second copy.
test('the Codex skill adapter defers to the root skill', () => {
  assert.equal(codexPlugin.skills, './.plugin-skills/');
  const adapter = '.plugin-skills/agybird/SKILL.md';
  assert.equal(field(adapter, 'name'), 'agybird');
  assert.equal(field(adapter, 'description'), field('SKILL.md', 'description'));
  assert.match(read(adapter), /<plugin-root>\/SKILL\.md/);
  assert.ok(read(adapter).length < 1500, 'the adapter must stay a pointer, not a copy');
});

test('the Codex interface has every field the plugin directory requires', () => {
  const ui = codexPlugin.interface;
  for (const key of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
    assert.equal(typeof ui[key], 'string', `interface.${key} is missing`);
  }
  assert.equal(ui.displayName, plugin.displayName);
  assert.ok(ui.displayName.length <= 30);
  assert.ok(ui.shortDescription.length <= 30);
  assert.ok(ui.longDescription.length <= 4000);
  assert.match(ui.longDescription, /unofficial/i);
  assert.deepEqual(ui.capabilities, []);
  assert.equal(ui.websiteURL, policyUrls.homepage);
  assert.equal(ui.supportURL, policyUrls.support);
  assert.equal(ui.privacyPolicyURL, policyUrls.privacy);
  assert.equal(ui.termsOfServiceURL, policyUrls.terms);
  assert.ok(ui.defaultPrompt.length >= 1 && ui.defaultPrompt.length <= 3);
  for (const prompt of ui.defaultPrompt) {
    assert.ok(prompt.length <= 128, `starter prompt too long: ${prompt}`);
    assert.doesNotMatch(prompt, /@/);
    // Agybird triggers only when the user names it, so every starter prompt must.
    assert.match(prompt, /\bagy\b|Antigravity CLI|Agybird/);
  }
  assert.equal(ui.brandColor, '#9750C4');
  assert.equal(ui.brandColorDark, '#7FE2CE');
  for (const key of ['composerIcon', 'composerIconDark', 'logo', 'logoDark']) assertAsset(ui[key]);
  assert.equal(ui.logo, plugin.icon);
});

test('the Codex marketplace lists the consolidated Finolabs catalog under the Finolabs identifier', () => {
  assert.equal(codexMarketplace.name, 'Finolabs');
  assert.equal(codexMarketplace.interface?.displayName, 'Finolabs');
  assert.deepEqual(codexMarketplace.plugins, [
    {
      name: codexPlugin.name,
      source: { source: 'local', path: './' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: codexPlugin.interface.category,
    },
    {
      name: 'vietnamizer',
      source: { source: 'url', url: 'https://github.com/fioenix/vietnamizer.git' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Productivity',
    },
    {
      name: 'markmap-skills',
      source: { source: 'url', url: 'https://github.com/fioenix/markmap-skills.git' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Productivity',
    },
  ]);
});

test('the icon set shares one self-contained mark across light and dark variants', () => {
  const shape = (path) => read(path).replace(/<title[^>]*>[^<]*<\/title>/, '').replace(/#[0-9A-F]{6}/gi, 'COLOR');
  for (const path of ['assets/icon.svg', 'assets/icon-dark.svg', 'assets/wordmark.svg', 'assets/wordmark-dark.svg']) {
    assert.doesNotMatch(read(path), /<image|<script|href=|url\(/i, `${path} must not load external resources`);
    assert.match(read(path), /<title id="title">Agybird/);
  }
  for (const path of ['assets/icon.svg', 'assets/icon-dark.svg']) {
    assert.match(read(path), /viewBox="0 0 128 128"/);
  }
  assert.equal(shape('assets/icon-dark.svg'), shape('assets/icon.svg'));
  assert.equal(shape('assets/wordmark-dark.svg'), shape('assets/wordmark.svg'));
  assert.match(read('assets/icon.svg'), /stroke="#9750C4"/);
  assert.match(read('assets/icon-dark.svg'), /stroke="#7FE2CE"/);
  const mark = (path) => read(path).match(/<(?:path|circle) [^>]+\/>/g);
  assert.deepEqual(mark('assets/wordmark.svg'), mark('assets/icon.svg'));

  const png = readFileSync(new URL('assets/icon.png', root));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'icon.png must keep an alpha channel');
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

test('README documents both plugin install paths alongside the skill install path', () => {
  const readme = read('README.md');
  assert.match(readme, /\/plugin marketplace add fioenix\/agybird/);
  assert.match(readme, /\/plugin install agybird@agybird/);
  assert.match(readme, /codex plugin marketplace add fioenix\/agybird/);
  assert.match(readme, /codex plugin add agybird@Finolabs/);
  assert.match(readme, /codex plugin add vietnamizer@Finolabs/);
  assert.match(readme, /codex plugin add markmap-skills@Finolabs/);
  assert.match(readme, /\(assets\/wordmark\.svg#gh-light-mode-only\)/);
  assert.match(readme, /\(assets\/wordmark-dark\.svg#gh-dark-mode-only\)/);
});

test('the policy pages the manifests link to exist', () => {
  assert.match(read('PRIVACY.md'), /~\/\.agybird\/sessions\//);
  assert.match(read('PRIVACY.md'), /Google/);
  assert.match(read('TERMS.md'), /MIT License/);
  assert.match(read('TERMS.md'), /not affiliated/);
});

test('the skill UI metadata and package files carry the icon', () => {
  const ui = read('agents/openai.yaml');
  const icons = [...ui.matchAll(/^\s+icon_\w+: "([^"]+)"$/gm)].map((match) => match[1]);
  assert.equal(icons.length, 2);
  for (const icon of icons) assertAsset(icon);
  assert.match(ui, /brand_color: "#9750C4"/);
  for (const path of ['assets/', 'agents/']) assert.ok(packageJson.files.includes(path), `package.json files lacks ${path}`);
});
