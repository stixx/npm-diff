/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const core = require('@actions/core');
const { NpmDiffRunner } = require('../../src/action');
const { GitService } = require('../../src/git.service');
const lockfileParser = require('../../src/lockfile.parser');
const comparer = require('../../src/comparer');
const formatter = require('../../src/formatter');

// Mocking dependencies
const originalExistsSync = fs.existsSync;
const originalSetOutput = core.setOutput;
const originalDebug = core.debug;
const originalGetInput = core.getInput;

describe('NpmDiffRunner', () => {
  let runner;
  let outputs = {};
  let inputs = {};
  let debugLogs = [];

  beforeEach(() => {
    runner = new NpmDiffRunner();
    outputs = {};
    inputs = {
      'base-ref': 'main',
      path: 'package-lock.json',
      'include-transitive': 'false',
    };
    debugLogs = [];

    // Mock core.setOutput
    core.setOutput = (name, value) => {
      outputs[name] = value;
    };

    // Mock core.debug
    core.debug = (msg) => {
      debugLogs.push(msg);
    };

    // Mock core.getInput
    core.getInput = (name) => inputs[name] || '';

    // Mock fs.existsSync
    fs.existsSync = () => true;

    // Mock GitService methods
    GitService.prototype.getMergeBase = () => 'base-sha';
    GitService.prototype.getChangedFiles = () => ['package-lock.json'];
    GitService.prototype.getFileAtRevision = () => '{}';

    // Mock other modules
    lockfileParser.parseLockfile = () => ({});
    comparer.comparePackages = () => ({ added: [], removed: [], updated: [] });
    formatter.formatMarkdown = () => 'markdown-diff';
  });

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    core.setOutput = originalSetOutput;
    core.debug = originalDebug;
    core.getInput = originalGetInput;
  });

  it('should run successfully when changes are detected', () => {
    runner.run();

    assert.strictEqual(outputs['has_changes'], 'true');
    assert.strictEqual(outputs['diff'], 'markdown-diff');
    assert.strictEqual(outputs['added_count'], '0');
    assert.strictEqual(outputs['removed_count'], '0');
    assert.strictEqual(outputs['updated_count'], '0');
  });

  it('should handle missing package-lock.json', () => {
    fs.existsSync = () => false;

    runner.run();

    assert.strictEqual(outputs['has_changes'], 'false');
    assert.match(outputs['diff'], /No package-lock.json found/);
  });

  it('should handle git merge-base failure', () => {
    GitService.prototype.getMergeBase = () => {
      throw new Error('git error');
    };

    runner.run();

    assert.strictEqual(outputs['has_changes'], 'false');
    assert.match(outputs['diff'], /Error finding merge base/);
  });

  it('should handle no changes to package-lock.json', () => {
    GitService.prototype.getChangedFiles = () => ['other-file.txt'];

    runner.run();

    assert.strictEqual(outputs['has_changes'], 'false');
    assert.match(outputs['diff'], /No changes to package-lock.json/);
  });

  it('should handle git diff failure', () => {
    GitService.prototype.getChangedFiles = () => {
      throw new Error('diff error');
    };

    runner.run();

    assert.strictEqual(outputs['has_changes'], 'false');
    assert.match(outputs['diff'], /Error running git diff/);
  });

  it('should correctly count changes', () => {
    comparer.comparePackages = () => ({
      added: [{ name: 'pkg1' }],
      removed: [{ name: 'pkg2' }, { name: 'pkg3' }],
      updated: [{ name: 'pkg4' }, { name: 'pkg5' }, { name: 'pkg6' }],
    });

    runner.run();

    assert.strictEqual(outputs['added_count'], '1');
    assert.strictEqual(outputs['removed_count'], '2');
    assert.strictEqual(outputs['updated_count'], '3');
  });
});
