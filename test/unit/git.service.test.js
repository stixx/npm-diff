/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { GitService } = require('../../src/git.service.ts');

test('GitService.execute runs a command and returns output', () => {
  const git = new GitService();
  const output = git.execute(['rev-parse', '--is-inside-work-tree']);
  assert.strictEqual(output, 'true');
});

test('GitService.execute handles arguments with spaces', () => {
  const git = new GitService();
  // Call execute with a value that includes spaces to exercise quoting logic
  const output = git.execute(['-c', 'user.name=Alice Smith', 'version']);
  assert.match(output, /git version/);
});

test('GitService.execute throws on error if not ignored', () => {
  const git = new GitService();
  assert.throws(() => {
    git.execute(['invalid-command']);
  });
});

test('GitService.execute returns empty string on error if ignored', () => {
  const git = new GitService();
  const output = git.execute(['invalid-command'], { ignoreErrors: true });
  assert.strictEqual(output, '');
});

test('GitService.getMergeBase validates baseRef', () => {
  const git = new GitService();
  assert.throws(() => {
    git.getMergeBase('main; rm -rf /');
  }, /Invalid base-ref/);

  assert.throws(() => {
    git.getMergeBase('main&whoami');
  }, /Invalid base-ref/);

  assert.throws(() => {
    git.getMergeBase('main|ls');
  }, /Invalid base-ref/);
});

test('GitService.getFileAtRevision validates path', () => {
  const git = new GitService();
  assert.throws(() => {
    git.getFileAtRevision('main', 'package-lock.json; rm -rf /');
  }, /Invalid path/);

  assert.throws(() => {
    git.getFileAtRevision('main', 'package-lock.json&whoami');
  }, /Invalid path/);

  assert.throws(() => {
    git.getFileAtRevision('main', 'package-lock.json|ls');
  }, /Invalid path/);

  assert.throws(() => {
    git.getFileAtRevision('main', 'package-lock.json$(whoami)');
  }, /Invalid path/);
});

test('GitService.getFileAtRevision validates revision', () => {
  const git = new GitService();
  assert.throws(() => {
    git.getFileAtRevision('main; rm -rf /', 'package-lock.json');
  }, /Invalid revision/);

  assert.throws(() => {
    git.getFileAtRevision('main&whoami', 'package-lock.json');
  }, /Invalid revision/);

  assert.throws(() => {
    git.getFileAtRevision('main|ls', 'package-lock.json');
  }, /Invalid revision/);

  assert.throws(() => {
    git.getFileAtRevision('main$(whoami)', 'package-lock.json');
  }, /Invalid revision/);

  assert.throws(() => {
    git.getFileAtRevision('main:something', 'package-lock.json');
  }, /Invalid revision/);
});

test('GitService.getChangedFiles validates baseRevision', () => {
  const git = new GitService();
  assert.throws(() => {
    git.getChangedFiles('main; rm -rf /');
  }, /Invalid base-revision/);

  assert.throws(() => {
    git.getChangedFiles('main&whoami');
  }, /Invalid base-revision/);

  assert.throws(() => {
    git.getChangedFiles('main|ls');
  }, /Invalid base-revision/);

  assert.throws(() => {
    git.getChangedFiles('main$(whoami)');
  }, /Invalid base-revision/);
});
