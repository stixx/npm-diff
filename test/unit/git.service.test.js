/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { GitService } = require('../../src/git.service');

test('GitService.execute runs a command and returns output', () => {
  const git = new GitService();
  const output = git.execute(['rev-parse', '--is-inside-work-tree']);
  assert.strictEqual(output, 'true');
});

test('GitService.execute handles arguments with spaces', () => {
  const git = new GitService();
  // Use git config to verify that arguments with spaces are correctly preserved and echoed back
  const name = 'Alice Smith';
  git.execute(['config', 'user.name', name]);
  const output = git.execute(['config', 'user.name']);
  assert.strictEqual(output, name);
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

test('GitService.getMergeBase happy path', () => {
  const git = new GitService();
  const originalExecute = git.execute;
  let calls = [];
  git.execute = (args) => {
    calls.push(args);
    if (args[1] === 'origin/main') return 'merge-base-sha';
    throw new Error('fail');
  };

  try {
    const result = git.getMergeBase('main');
    assert.strictEqual(result, 'merge-base-sha');
    assert.deepStrictEqual(calls, [['merge-base', 'origin/main', 'HEAD']]);
  } finally {
    git.execute = originalExecute;
  }
});

test('GitService.getMergeBase fallback path', () => {
  const git = new GitService();
  const originalExecute = git.execute;
  let calls = [];
  git.execute = (args) => {
    calls.push(args);
    if (args[1] === 'origin/main') throw new Error('no origin');
    return 'local-merge-base-sha';
  };

  try {
    const result = git.getMergeBase('main');
    assert.strictEqual(result, 'local-merge-base-sha');
    assert.deepStrictEqual(calls, [
      ['merge-base', 'origin/main', 'HEAD'],
      ['merge-base', 'main', 'HEAD'],
    ]);
  } finally {
    git.execute = originalExecute;
  }
});

test('GitService.getChangedFiles happy path', () => {
  const git = new GitService();
  const originalExecute = git.execute;
  git.execute = () => '  file1.txt  \n\n  file2.txt  \n  ';

  try {
    const result = git.getChangedFiles('base-sha');
    assert.deepStrictEqual(result, ['file1.txt', 'file2.txt']);
  } finally {
    git.execute = originalExecute;
  }
});

test('GitService.getFileAtRevision happy path', () => {
  const git = new GitService();
  const originalExecute = git.execute;
  git.execute = () => 'file content';

  try {
    const result = git.getFileAtRevision('sha', 'path/to/file');
    assert.strictEqual(result, 'file content');
  } finally {
    git.execute = originalExecute;
  }
});

test('GitService.getFileAtRevision missing file', () => {
  const git = new GitService();
  const originalExecute = git.execute;
  git.execute = (args, options) => {
    if (options.ignoreErrors) return '';
    throw new Error('not found');
  };

  try {
    const result = git.getFileAtRevision('sha', 'path/to/file');
    assert.strictEqual(result, '');
  } finally {
    git.execute = originalExecute;
  }
});
