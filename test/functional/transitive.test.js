/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

test('Functional test: respects include-transitive input', () => {
  const root = process.cwd();
  const tempDir = path.join(root, 'temp-functional-test-transitive');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir);

  try {
    // Setup git repo
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });

    // Create initial package-lock.json (v3) with a transitive dependency
    const lockfile = {
      name: 'test-pkg',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'test-pkg',
          version: '1.0.0',
          dependencies: {
            axios: '^1.0.0',
          },
        },
        'node_modules/axios': {
          version: '1.0.0',
          dependencies: {
            follow: '1.0.0',
          },
        },
        'node_modules/follow': {
          version: '1.0.0',
        },
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lockfile, null, 2));
    execSync('git add package-lock.json', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    execSync('git branch -m main', { cwd: tempDir });

    // Create a new branch and upgrade BOTH direct and transitive dependency
    execSync('git checkout -b feature', { cwd: tempDir });
    lockfile.packages['node_modules/axios'].version = '1.1.0';
    lockfile.packages[''].dependencies.axios = '^1.1.0';
    lockfile.packages['node_modules/follow'].version = '1.1.0';

    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lockfile, null, 2));
    execSync('git add package-lock.json', { cwd: tempDir });
    execSync('git commit -m "Upgrade axios and follow"', { cwd: tempDir });

    // Add remote origin to self to satisfy git merge-base origin/main
    execSync('git remote add origin .', { cwd: tempDir });
    execSync('git fetch origin', { cwd: tempDir });

    // Prepare GitHub Action environment
    const outputPath = path.join(tempDir, 'github_output');

    // Test Case 1: include-transitive = false (default)
    fs.writeFileSync(outputPath, '');
    const envDefault = {
      ...process.env,
      'INPUT_BASE_REF': 'main',
      'INPUT_INCLUDE_TRANSITIVE': 'false',
      GITHUB_OUTPUT: outputPath,
      GITHUB_WORKSPACE: tempDir,
    };

    const actionPath = path.join(root, 'src', 'action.ts');
    execSync(`node -r ts-node/register ${actionPath}`, {
      cwd: tempDir,
      env: envDefault,
      stdio: 'inherit',
    });

    let outputContent = fs.readFileSync(outputPath, 'utf8');
    console.log('Action Outputs (transitive=false):\n', outputContent);

    assert.match(outputContent, /updated_count[\s\S]+1/);
    assert.match(outputContent, /axios \| Upgraded/);
    assert.ok(
      !outputContent.includes('follow | Upgraded'),
      'Should NOT include transitive dependency follow'
    );

    // Test Case 2: include-transitive = true
    fs.writeFileSync(outputPath, '');
    const envTransitive = {
      ...process.env,
      'INPUT_BASE_REF': 'main',
      'INPUT_INCLUDE_TRANSITIVE': 'true',
      GITHUB_OUTPUT: outputPath,
      GITHUB_WORKSPACE: tempDir,
    };

    execSync(`node -r ts-node/register ${actionPath}`, {
      cwd: tempDir,
      env: envTransitive,
      stdio: 'inherit',
    });

    outputContent = fs.readFileSync(outputPath, 'utf8');
    console.log('Action Outputs (transitive=true):\n', outputContent);

    assert.match(outputContent, /updated_count[\s\S]+2/);
    assert.match(outputContent, /axios \| Upgraded/);
    assert.match(outputContent, /follow \| Upgraded/);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
