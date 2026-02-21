/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

test('Functional test: detects devDependency change in package.json', () => {
  const root = process.cwd();
  const tempDir = path.join(root, 'temp-functional-test-pkgjson');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir);

  try {
    // Setup git repo
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });

    // Create initial package.json
    const pkgJson = {
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: {
        axios: '1.0.0',
      },
      devDependencies: {
        vite: '^4.3.9',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
    execSync('git add package.json', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    execSync('git branch -m main', { cwd: tempDir });

    // Create a new branch and change dependencies
    execSync('git checkout -b feature', { cwd: tempDir });

    // 1. Upgrade vite (devDep)
    pkgJson.devDependencies.vite = '^4.5.14';
    // 2. Add lodash (dep)
    pkgJson.dependencies.lodash = '4.17.21';
    // 3. Remove axios (dep)
    delete pkgJson.dependencies.axios;

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
    execSync('git add package.json', { cwd: tempDir });
    execSync('git commit -m "Update dependencies"', { cwd: tempDir });

    // Add remote origin to self to satisfy git merge-base origin/main
    execSync('git remote add origin .', { cwd: tempDir });
    execSync('git fetch origin', { cwd: tempDir });

    // Prepare GitHub Action environment
    const outputPath = path.join(tempDir, 'github_output');
    fs.writeFileSync(outputPath, '');

    const env = {
      ...process.env,
      INPUT_PATH: 'package.json',
      'INPUT_BASE_REF': 'main',
      GITHUB_OUTPUT: outputPath,
      GITHUB_WORKSPACE: tempDir,
    };

    // Run the action as a script
    const actionPath = path.join(root, 'src', 'action.ts');
    execSync(`node -r ts-node/register ${actionPath}`, {
      cwd: tempDir,
      env,
      stdio: 'inherit',
    });

    const outputContent = fs.readFileSync(outputPath, 'utf8');
    console.log('Action Outputs (package.json):\n', outputContent);

    assert.match(outputContent, /has_changes[\s\S]+true/);
    assert.match(outputContent, /updated_count[\s\S]+1/);
    assert.match(outputContent, /added_count[\s\S]+1/);
    assert.match(outputContent, /removed_count[\s\S]+1/);
    assert.match(outputContent, /vite \| Upgraded \| `\^4\.3\.9` \| `\^4\.5\.14`/);
    assert.match(outputContent, /lodash \| Added \| - \| `4\.17\.21`/);
    assert.match(outputContent, /axios \| Removed \| `1\.0\.0` \| -/);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

test('Functional test: detects package upgrade in package-lock.json', () => {
  const root = process.cwd();
  const tempDir = path.join(root, 'temp-functional-test-lockfile');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir);

  try {
    // Setup git repo
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });

    // Create initial package-lock.json (v3)
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
        },
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lockfile, null, 2));
    execSync('git add package-lock.json', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
    execSync('git branch -m main', { cwd: tempDir });

    // Create a new branch and upgrade dependency
    execSync('git checkout -b feature', { cwd: tempDir });
    lockfile.packages['node_modules/axios'].version = '1.1.0';
    lockfile.packages[''].dependencies.axios = '^1.1.0';

    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lockfile, null, 2));
    execSync('git add package-lock.json', { cwd: tempDir });
    execSync('git commit -m "Upgrade axios"', { cwd: tempDir });

    // Add remote origin to self to satisfy git merge-base origin/main
    execSync('git remote add origin .', { cwd: tempDir });
    execSync('git fetch origin', { cwd: tempDir });

    // Prepare GitHub Action environment
    const outputPath = path.join(tempDir, 'github_output');
    fs.writeFileSync(outputPath, '');

    const env = {
      ...process.env,
      // INPUT_PATH defaults to package-lock.json
      'INPUT_BASE_REF': 'main',
      GITHUB_OUTPUT: outputPath,
      GITHUB_WORKSPACE: tempDir,
    };

    // Run the action as a script
    const actionPath = path.join(root, 'src', 'action.ts');
    execSync(`node -r ts-node/register ${actionPath}`, {
      cwd: tempDir,
      env,
      stdio: 'inherit',
    });

    const outputContent = fs.readFileSync(outputPath, 'utf8');
    console.log('Action Outputs (package-lock.json):\n', outputContent);

    assert.match(outputContent, /has_changes[\s\S]+true/);
    assert.match(outputContent, /updated_count[\s\S]+1/);
    assert.match(outputContent, /axios \| Upgraded \| `1\.0\.0` \| `1\.1\.0`/);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
