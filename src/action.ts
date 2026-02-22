import * as fs from 'fs';
import { execSync } from 'child_process';
import * as core from '@actions/core';

interface PackageInfo {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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
        // Direct dependencies are listed in the dependencies blocks of the root package ('')
        // and any workspace packages (local packages that don't have node_modules in their path).
        const directDeps = new Set<string>();
        const localPackageKeys = Object.keys(data.packages).filter(
          (key) => key === '' || !key.includes('node_modules')
        );

        for (const key of localPackageKeys) {
          const pkg = data.packages[key] as PackageInfo;
          if (pkg) {
            // Include local packages as packages to compare (they have versions too)
            packages[key] = pkg;

            const deps = {
              ...(pkg.dependencies || {}),
              ...(pkg.devDependencies || {}),
              ...(pkg.optionalDependencies || {}),
              ...(pkg.peerDependencies || {}),
            };
            Object.keys(deps).forEach((d) => directDeps.add(d));
          }
        }

        for (const [key, info] of Object.entries(data.packages)) {
          if (key === '') continue;

          // Check if this package is in our directDeps list
          const name = key.replace(/^(.*node_modules\/)/, '');
          if (directDeps.has(name)) {
            // We want to include it if:
            // 1. It's in a top-level node_modules (e.g., "node_modules/axios")
            // 2. OR it's in a workspace's node_modules (e.g., "packages/pkg1/node_modules/axios")
            // BUT we only want the "closest" one if there are multiple.
            // Actually, npm-diff's current logic tries to be simple.
            // Let's allow any node_modules entry as long as its name is in directDeps
            // and it's not nested inside another node_modules (i.e. it's a direct dep of SOME local package)
            if (!key.match(/\/node_modules\/.*\/node_modules\//)) {
              packages[key] = info;
            }
          }
        }
      }
    } else if (data.dependencies || data.devDependencies || data.optionalDependencies) {
      core.debug('Detected lockfile v1 (dependencies found)');
      // For v1, the data itself contains the root dependencies
      packages[''] = data as unknown as PackageInfo;

      const v1Deps = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
        ...(data.optionalDependencies || {}),
      };
      for (const [name, info] of Object.entries(v1Deps)) {
        packages[name] = info;
      }
    } else {
      core.debug('No packages or dependencies found in lockfile');
    }

    // Remove the root package entry if it exists to avoid comparing it
    // Wait, let's keep it if we want to detect changes in local packages
    // Actually, in comparePackages we handle it.

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
  const allPackagesArray = Array.from(allPackages);

  // Collect changes in resolved versions
  const resolvedChanges = new Map<string, PackageChange>();
  for (const pkg of allPackages) {
    const inBase = basePackages.has(pkg);
    const inHead = headPackages.has(pkg);
    const name = pkg.replace(/^(.*node_modules\/)/, '') || pkg;

    // Skip local packages here, we handle them differently
    if (!pkg.includes('node_modules')) {
      continue;
    }

    // Skip packages that have no version
    if (inHead && !head[pkg].version) {
      core.debug(`Skipping package ${pkg} in head: no version found`);
      continue;
    }
    if (inBase && !base[pkg].version && !inHead) {
      core.debug(`Skipping package ${pkg} in base: no version found`);
      continue;
    }

    if (!inBase && inHead) {
      resolvedChanges.set(name, { name, version: head[pkg].version || 'unknown' });
    } else if (inBase && !inHead) {
      resolvedChanges.set(name, {
        name,
        version: base[pkg].version || 'unknown',
        oldVersion: base[pkg].version,
      });
    } else if (inBase && inHead) {
      const baseVersion = base[pkg].version;
      const headVersion = head[pkg].version;
      if (baseVersion && headVersion && baseVersion !== headVersion) {
        resolvedChanges.set(name, { name, oldVersion: baseVersion, newVersion: headVersion });
      }
    }
  }

  // Collect changes in constraints
  const localPackageKeys = allPackagesArray.filter((pkg) => !pkg.includes('node_modules'));
  for (const pkg of localPackageKeys) {
    const basePkg = base[pkg];
    const headPkg = head[pkg];

    const allDeps = new Set([
      ...Object.keys(basePkg?.dependencies || {}),
      ...Object.keys(headPkg?.dependencies || {}),
      ...Object.keys(basePkg?.devDependencies || {}),
      ...Object.keys(headPkg?.devDependencies || {}),
      ...Object.keys(basePkg?.optionalDependencies || {}),
      ...Object.keys(headPkg?.optionalDependencies || {}),
      ...Object.keys(basePkg?.peerDependencies || {}),
      ...Object.keys(headPkg?.peerDependencies || {}),
    ]);

    for (const depName of allDeps) {
      const baseConstraint =
        basePkg?.dependencies?.[depName] ||
        basePkg?.devDependencies?.[depName] ||
        basePkg?.optionalDependencies?.[depName] ||
        basePkg?.peerDependencies?.[depName];
      const headConstraint =
        headPkg?.dependencies?.[depName] ||
        headPkg?.devDependencies?.[depName] ||
        headPkg?.optionalDependencies?.[depName] ||
        headPkg?.peerDependencies?.[depName];

      if (baseConstraint !== headConstraint) {
        const existingChange = resolvedChanges.get(depName);

        if (!existingChange) {
          // No resolved change, but constraint changed. We report it as an update.
          changes.updated.push({
            name: depName,
            oldVersion: baseConstraint || '-',
            newVersion: headConstraint || '-',
          });
        }
      }
    }
  }

  // Now add the resolved changes to the final changes object
  for (const change of resolvedChanges.values()) {
    if (change.oldVersion && !change.newVersion && change.version) {
      changes.removed.push(change);
    } else if (!change.oldVersion && change.version) {
      changes.added.push(change);
    } else {
      changes.updated.push(change);
    }
  }

  return changes;
}

export function getCompareLink(
  packageName: string,
  oldVersion?: string,
  newVersion?: string
): string {
  // Use only the package name without node_modules path
  const name = packageName.split('node_modules/').pop() || packageName;

  if (oldVersion && newVersion && oldVersion !== '-' && newVersion !== '-') {
    const v1 = oldVersion.replace(/^[`^~]/, '').replace(/`$/, '');
    const v2 = newVersion.replace(/^[`^~]/, '').replace(/`$/, '');

    // Check if it's a valid version comparison (not a constraint like ^1.0.0 vs ^1.1.0)
    // Actually npmdiff.dev might handle it, but it's better with exact versions.
    return `[Compare](https://npmdiff.dev/compare/${name}/${v1}/${v2})`;
  }

  return `[Details](https://www.npmjs.com/package/${name}?activeTab=versions)`;
}

export function formatMarkdown(changes: Changes, includeTransitive: boolean = false): string {
  const totalChanges = changes.added.length + changes.removed.length + changes.updated.length;

  if (totalChanges === 0) {
    let message = '_No package changes detected_';
    if (!includeTransitive) {
      message +=
        '\n\nNote: Transitive dependencies are excluded. Use `include-transitive: true` to see all changes.';
    }
    message +=
      '\n\nNote: If `package-lock.json` was modified, the changes might only affect metadata (like integrity hashes) or resolved URLs, rather than version numbers.';
    return message;
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
    const pkgChange =
      changes.added.find((p) => p.name === row.name) ||
      changes.removed.find((p) => p.name === row.name) ||
      changes.updated.find((p) => p.name === row.name);

    output += `${row.name} | ${row.operation} | ${row.base} | ${row.target} | ${getCompareLink(
      row.name,
      pkgChange?.oldVersion ||
        (pkgChange?.version && row.operation === 'Removed' ? pkgChange.version : undefined),
      pkgChange?.newVersion ||
        (pkgChange?.version && row.operation === 'Added' ? pkgChange.version : undefined)
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
  const markdown = formatMarkdown(changes, includeTransitive);

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
