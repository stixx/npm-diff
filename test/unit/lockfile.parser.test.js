/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { parseLockfile } = require('../../src/lockfile.parser.ts');

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
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: {
          pkg: '^1.1.0',
        },
      },
      'node_modules/pkg': { version: '1.1.0' },
    },
  });

  const packages = parseLockfile('package-lock.json', content);

  assert.deepStrictEqual(packages[''], {
    name: 'root',
    version: '1.0.0',
    dependencies: {
      pkg: '^1.1.0',
    },
  });
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

test('parseLockfile filters transitive by default', () => {
  const content = JSON.stringify({
    packages: {
      '': {
        dependencies: { direct: '1.0.0' },
      },
      'node_modules/direct': {
        version: '1.0.0',
        dependencies: { transitive: '2.0.0' },
      },
      'node_modules/transitive': {
        version: '2.0.0',
      },
    },
  });

  const packages = parseLockfile('package-lock.json', content);
  assert.ok(packages['node_modules/direct']);
  assert.strictEqual(packages['node_modules/transitive'], undefined);
});

test('parseLockfile includes transitive if requested', () => {
  const content = JSON.stringify({
    packages: {
      '': {
        dependencies: { direct: '1.0.0' },
      },
      'node_modules/direct': {
        version: '1.0.0',
        dependencies: { transitive: '2.0.0' },
      },
      'node_modules/transitive': {
        version: '2.0.0',
      },
    },
  });

  const packages = parseLockfile('package-lock.json', content, true);
  assert.ok(packages['node_modules/direct']);
  assert.ok(packages['node_modules/transitive']);
});
