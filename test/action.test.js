/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { comparePackages, formatMarkdown, parseLockfile } = require('../src/action.ts');

test('comparePackages identifies added, removed and updated packages', () => {
  const base = {
    'node_modules/old-pkg': { version: '1.0.0' },
    'node_modules/updated-pkg': { version: '1.0.0' },
  };
  const head = {
    'node_modules/updated-pkg': { version: '1.1.0' },
    'node_modules/new-pkg': { version: '2.0.0' },
  };

  const changes = comparePackages(base, head);

  assert.strictEqual(changes.added.length, 1);
  assert.strictEqual(changes.added[0].name, 'new-pkg');
  assert.strictEqual(changes.added[0].version, '2.0.0');

  assert.strictEqual(changes.removed.length, 1);
  assert.strictEqual(changes.removed[0].name, 'old-pkg');
  assert.strictEqual(changes.removed[0].version, '1.0.0');

  assert.strictEqual(changes.updated.length, 1);
  assert.strictEqual(changes.updated[0].name, 'updated-pkg');
  assert.strictEqual(changes.updated[0].oldVersion, '1.0.0');
  assert.strictEqual(changes.updated[0].newVersion, '1.1.0');
});

test('comparePackages handles empty lockfiles', () => {
  const base = {};
  const head = {};
  const changes = comparePackages(base, head);
  assert.strictEqual(changes.added.length, 0);
  assert.strictEqual(changes.removed.length, 0);
  assert.strictEqual(changes.updated.length, 0);
});

test('formatMarkdown returns message for no changes', () => {
  const changes = { added: [], removed: [], updated: [] };
  const markdown = formatMarkdown(changes);
  assert.strictEqual(markdown, '_No package changes detected_');
});

test('formatMarkdown formats changes as a table', () => {
  const changes = {
    added: [{ name: 'a', version: '1.0.0' }],
    removed: [{ name: 'r', version: '1.0.0' }],
    updated: [{ name: 'u', oldVersion: '1.0.0', newVersion: '1.1.0' }],
  };
  const markdown = formatMarkdown(changes);
  assert.match(markdown, /Packages \| Operation \| Base \| Target \| Link/);
  assert.match(markdown, /a \| Added \| - \| `1.0.0` \|/);
  assert.match(markdown, /r \| Removed \| `1.0.0` \| - \|/);
  assert.match(markdown, /u \| Upgraded \| `1.0.0` \| `1.1.0` \|/);
});

test('parseLockfile handles package.json and devDependencies', () => {
  const content = JSON.stringify({
    dependencies: { 'prod-pkg': '1.0.0' },
    devDependencies: { 'dev-pkg': '2.0.0' },
    optionalDependencies: { 'opt-pkg': '3.0.0' },
  });

  const packages = parseLockfile('package.json', content);

  assert.strictEqual(packages['prod-pkg'].version, '1.0.0');
  assert.strictEqual(packages['dev-pkg'].version, '2.0.0');
  assert.strictEqual(packages['opt-pkg'].version, '3.0.0');
});

test('parseLockfile handles lockfile v3 packages', () => {
  const content = JSON.stringify({
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'node_modules/pkg': { version: '1.1.0' },
    },
  });

  const packages = parseLockfile('package-lock.json', content);

  assert.strictEqual(packages[''], undefined);
  assert.strictEqual(packages['node_modules/pkg'].version, '1.1.0');
});

test('parseLockfile handles lockfile v1 dependencies', () => {
  const content = JSON.stringify({
    dependencies: {
      pkg: { version: '1.1.0' },
    },
  });

  const packages = parseLockfile('package-lock.json', content);

  assert.strictEqual(packages['pkg'].version, '1.1.0');
});
