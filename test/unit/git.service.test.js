/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { GitService } = require('../../src/git.service.ts');

test('GitService.execute runs a command and returns output', () => {
  const git = new GitService();
  const output = git.execute('echo "hello"');
  assert.strictEqual(output, 'hello');
});

test('GitService.execute throws on error if not ignored', () => {
  const git = new GitService();
  assert.throws(() => {
    git.execute('nonexistentcommand');
  });
});

test('GitService.execute returns empty string on error if ignored', () => {
  const git = new GitService();
  const output = git.execute('nonexistentcommand', { ignoreErrors: true });
  assert.strictEqual(output, '');
});
