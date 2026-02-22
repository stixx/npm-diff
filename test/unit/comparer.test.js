/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { comparePackages } = require('../../src/comparer.ts');

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

test('comparePackages does not collapse nested node_modules', () => {
  const base = {
    'node_modules/pkg': { version: '1.0.0' },
    'node_modules/other/node_modules/pkg': { version: '1.0.0' },
  };
  const head = {
    'node_modules/pkg': { version: '1.1.0' },
    'node_modules/other/node_modules/pkg': { version: '1.2.0' },
  };

  const changes = comparePackages(base, head);

  assert.strictEqual(changes.updated.length, 2);
  const names = changes.updated.map((u) => u.name);
  assert.ok(names.includes('pkg'));
  assert.ok(names.includes('other/node_modules/pkg'));
});

test('comparePackages handles constraint changes', () => {
  const base = {
    '': {
      dependencies: { pkg: '^1.0.0' },
    },
    'node_modules/pkg': { version: '1.0.5' },
  };
  const head = {
    '': {
      dependencies: { pkg: '^1.1.0' },
    },
    'node_modules/pkg': { version: '1.0.5' },
  };

  const changes = comparePackages(base, head);
  assert.strictEqual(changes.updated.length, 1);
  assert.strictEqual(changes.updated[0].name, 'pkg');
  assert.strictEqual(changes.updated[0].oldVersion, '^1.0.0');
  assert.strictEqual(changes.updated[0].newVersion, '^1.1.0');
});

test('comparePackages ignores constraint change if version also changed', () => {
  // Version change should take precedence or at least be the only one reported if it covers the same package
  const base = {
    '': {
      dependencies: { pkg: '^1.0.0' },
    },
    'node_modules/pkg': { version: '1.0.0' },
  };
  const head = {
    '': {
      dependencies: { pkg: '^1.1.0' },
    },
    'node_modules/pkg': { version: '1.1.0' },
  };

  const changes = comparePackages(base, head);
  // It should only have 1 updated entry for 'pkg'
  assert.strictEqual(changes.updated.length, 1);
  assert.strictEqual(changes.updated[0].name, 'pkg');
  assert.strictEqual(changes.updated[0].oldVersion, '1.0.0');
  assert.strictEqual(changes.updated[0].newVersion, '1.1.0');
});
