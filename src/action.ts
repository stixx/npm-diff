import * as fs from 'fs';
import { execSync } from 'child_process';
import * as core from '@actions/core';

interface PackageInfo {
  version?: string;
}

interface LockfileData {
  packages?: Record<string, PackageInfo | string>;
  dependencies?: Record<string, PackageInfo | string>;
  devDependencies?: Record<string, PackageInfo | string>;
  optionalDependencies?: Record<string, PackageInfo | string>;
}

export interface PackageChange {
  name: string;
  version?: string;
  oldVersion?: string;
  newVersion?: string;
}

export interface Changes {
  added: PackageChange[];
  removed: PackageChange[];
  updated: PackageChange[];
}

export function parseLockfile(
  path: string,
  contentStr: string | null = null,
  includeTransitive: boolean = false
): Record<string, PackageInfo> {
  try {
    const content = contentStr || fs.readFileSync(path, 'utf8');
    const data: LockfileData = JSON.parse(content);
    let packages: Record<string, PackageInfo | string> = {};

    if (data.packages) {
      core.debug('Detected lockfile v2+ (packages found)');
      if (includeTransitive) {
        packages = { ...data.packages };
      } else {
        // For lockfile v3, we only want to compare the direct dependencies
        // to keep the diff clean and avoid GitHub PR comment limits.
        // Direct dependencies are listed in the root package ('')
        const rootPackage = data.packages[''] as LockfileData | undefined;
        const directDeps = new Set([
          ...Object.keys(rootPackage?.dependencies || {}),
          ...Object.keys(rootPackage?.devDependencies || {}),
          ...Object.keys(rootPackage?.optionalDependencies || {}),
        ]);

        for (const [key, info] of Object.entries(data.packages)) {
          if (key === '') continue;
          const name = key.replace(/^node_modules\//, '');
          if (directDeps.has(name) && !key.includes('/node_modules/')) {
            packages[key] = info;
          }
        }
      }
    } else if (data.dependencies || data.devDependencies || data.optionalDependencies) {
      core.debug('Detected lockfile v1 (dependencies found)');
      packages = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
        ...(data.optionalDependencies || {}),
      };
    } else {
      core.debug('No packages or dependencies found in lockfile');
    }

    // Remove the root package entry if it exists to avoid comparing it
    if (packages['']) {
      delete packages[''];
    }

    const normalized: Record<string, PackageInfo> = {};
    for (const [name, info] of Object.entries(packages)) {
      if (typeof info === 'string') {
        normalized[name] = { version: info };
      } else if (info && typeof info === 'object') {
        normalized[name] = info as PackageInfo;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

export function comparePackages(
  base: Record<string, PackageInfo>,
  head: Record<string, PackageInfo>
): Changes {
  const changes: Changes = { added: [], removed: [], updated: [] };
  const basePackages = new Set(Object.keys(base));
  const headPackages = new Set(Object.keys(head));
  const allPackages = new Set([...basePackages, ...headPackages]);

  for (const pkg of allPackages) {
    const inBase = basePackages.has(pkg);
    const inHead = headPackages.has(pkg);
    const name = pkg.replace(/^node_modules\//, '');

    // Skip packages that have no version (e.g., aliases or metadata without version)
    if (inHead && !head[pkg].version) continue;
    if (inBase && !base[pkg].version && !inHead) continue;

    if (!inBase && inHead) {
      changes.added.push({ name, version: head[pkg].version || 'unknown' });
    } else if (inBase && !inHead) {
      changes.removed.push({ name, version: base[pkg].version || 'unknown' });
    } else if (inBase && inHead) {
      const baseVersion = base[pkg].version;
      const headVersion = head[pkg].version;
      if (baseVersion && headVersion && baseVersion !== headVersion) {
        changes.updated.push({ name, oldVersion: baseVersion, newVersion: headVersion });
      }
    }
  }

  return changes;
}

export function getCompareLink(packageName: string): string {
  // Use only the package name without node_modules path
  const name = packageName.split('node_modules/').pop() || packageName;
  return `[Compare](https://www.npmjs.com/package/${name}?activeTab=versions)`;
}

export function formatMarkdown(changes: Changes): string {
  const totalChanges = changes.added.length + changes.removed.length + changes.updated.length;

  if (totalChanges === 0) {
    return '_No package changes detected_';
  }

  let output = 'Packages | Operation | Base | Target | Link\n';
  output += '--- | --- | --- | --- | ---\n';

  const rows = [
    ...changes.added.map((pkg) => ({
      name: pkg.name,
      operation: 'Added',
      base: '-',
      target: `\`${pkg.version}\``,
    })),
    ...changes.removed.map((pkg) => ({
      name: pkg.name,
      operation: 'Removed',
      base: `\`${pkg.version}\``,
      target: '-',
    })),
    ...changes.updated.map((pkg) => ({
      name: pkg.name,
      operation: 'Upgraded',
      base: `\`${pkg.oldVersion}\``,
      target: `\`${pkg.newVersion}\``,
    })),
  ];

  for (const row of rows) {
    output += `${row.name} | ${row.operation} | ${row.base} | ${row.target} | ${getCompareLink(
      row.name
    )}\n`;
  }

  return output;
}

// Main execution
export function run(): void {
  const getCustomInput = (name: string) => {
    return (
      core.getInput(name) || process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || ''
    );
  };

  const baseRef = getCustomInput('base-ref') || 'main';
  const lockfilePath = getCustomInput('path') || 'package-lock.json';
  const includeTransitive = getCustomInput('include-transitive') === 'true';

  // Check if lockfile exists
  if (!fs.existsSync(lockfilePath)) {
    core.setOutput('has_changes', 'false');
    core.setOutput('diff', `_No package-lock.json found at ${lockfilePath}_`);
    core.setOutput('added_count', '0');
    core.setOutput('removed_count', '0');
    core.setOutput('updated_count', '0');
    return;
  }

  // Get the merge base to ensure we only see changes from the current branch
  let baseRevision = `origin/${baseRef}`;
  core.debug(`Base ref: ${baseRef}`);
  try {
    const mergeBaseCommand = `git merge-base "origin/${baseRef}" HEAD`;
    core.debug(`Running merge-base command: ${mergeBaseCommand}`);
    const mergeBase = execSync(mergeBaseCommand, {
      maxBuffer: 50 * 1024 * 1024,
    })
      .toString()
      .trim();
    if (mergeBase) {
      core.debug(`Found merge base: ${mergeBase}`);
      baseRevision = mergeBase;
    }
  } catch (err: unknown) {
    // If origin/baseRef fails, try just baseRef
    try {
      const mergeBaseCommand = `git merge-base "${baseRef}" HEAD`;
      core.debug(`Running backup merge-base command: ${mergeBaseCommand}`);
      const mergeBase = execSync(mergeBaseCommand).toString().trim();
      if (mergeBase) {
        core.debug(`Found backup merge base: ${mergeBase}`);
        baseRevision = mergeBase;
      }
    } catch {
      if (err instanceof Error) {
        core.debug(`Error finding merge base: ${err.message}`);
      }
    }
  }

  // Check if lockfile changed
  try {
    const diffCommand = `git diff --name-only "${baseRevision}" HEAD`;
    core.debug(`Running diff command: ${diffCommand}`);
    const diff = execSync(diffCommand, {
      maxBuffer: 50 * 1024 * 1024,
    }).toString();
    const changedFiles = diff
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    core.debug(`Changed files: ${changedFiles.join(', ')}`);
    core.debug(`Checking for: ${lockfilePath}`);

    // Normalize path to match git diff output (no leading ./)
    const normalizedPath = lockfilePath.replace(/^(\.\/)+/, '');
    if (!changedFiles.includes(normalizedPath)) {
      core.setOutput('has_changes', 'false');
      core.setOutput('diff', `_No changes to ${lockfilePath}_`);
      core.setOutput('added_count', '0');
      core.setOutput('removed_count', '0');
      core.setOutput('updated_count', '0');
      return;
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Error running git diff:', err.message);
    }
    // If git diff fails (e.g. shallow clone), we don't want to proceed with an empty base
    // as it would report all dependencies as added.
    core.setOutput('has_changes', 'false');
    core.setOutput(
      'diff',
      `_Error comparing branches. This may be due to a shallow clone. Try setting fetch-depth: 0 in actions/checkout._`
    );
    core.setOutput('added_count', '0');
    core.setOutput('removed_count', '0');
    core.setOutput('updated_count', '0');
    return;
  }

  core.setOutput('has_changes', 'true');

  // Get base version of lockfile
  let baseContent = '{}';
  try {
    const showCommand = `git show "${baseRevision}:${lockfilePath}"`;
    core.debug(`Running show command: ${showCommand}`);
    baseContent = execSync(showCommand, {
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024,
    }).toString();
  } catch (err: unknown) {
    if (err instanceof Error) {
      core.debug(`Error running git show: ${err.message}`);
    }
    // If it fails, baseContent remains '{}'
    // This could happen if the file didn't exist in the base branch
  }

  const base = parseLockfile(lockfilePath, baseContent, includeTransitive);
  const head = parseLockfile(lockfilePath, null, includeTransitive);

  core.debug(`Base packages found: ${Object.keys(base).length}`);
  core.debug(`Head packages found: ${Object.keys(head).length}`);

  const changes = comparePackages(base, head);
  const markdown = formatMarkdown(changes);

  core.setOutput('diff', markdown);
  core.setOutput('added_count', changes.added.length.toString());
  core.setOutput('removed_count', changes.removed.length.toString());
  core.setOutput('updated_count', changes.updated.length.toString());
}

if (
  (typeof require !== 'undefined' && require.main === module) ||
  (typeof process !== 'undefined' && process.argv[1]?.endsWith('action.ts'))
) {
  run();
}
