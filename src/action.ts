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
  contentStr: string | null = null
): Record<string, PackageInfo> {
  try {
    const content = contentStr || fs.readFileSync(path, 'utf8');
    const data: LockfileData = JSON.parse(content);
    let packages: Record<string, PackageInfo | string> = {};

    if (data.packages) {
      packages = data.packages;
    } else {
      packages = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
        ...(data.optionalDependencies || {}),
      };
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
    const name = pkg.replace('node_modules/', '');

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
  return `[Compare](https://www.npmjs.com/package/${packageName}?activeTab=versions)`;
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
  const baseRef = core.getInput('base-ref') || 'main';
  const lockfilePath = core.getInput('path') || 'package-lock.json';

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
  try {
    const mergeBase = execSync(`git merge-base "origin/${baseRef}" HEAD`).toString().trim();
    if (mergeBase) {
      baseRevision = mergeBase;
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Error finding merge base:', err.message);
    }
  }

  // Check if lockfile changed
  try {
    const diff = execSync(`git diff --name-only "${baseRevision}" HEAD`).toString();
    const changedFiles = diff
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    core.debug(`Changed files: ${changedFiles.join(', ')}`);
    core.debug(`Checking for: ${lockfilePath}`);

    if (!changedFiles.includes(lockfilePath)) {
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
  }

  core.setOutput('has_changes', 'true');

  // Get base version of lockfile
  let baseContent = '{}';
  try {
    baseContent = execSync(`git show "${baseRevision}:${lockfilePath}"`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString();
  } catch {
    // If it fails, baseContent remains '{}'
  }

  const base = parseLockfile(lockfilePath, baseContent);
  const head = parseLockfile(lockfilePath);
  const changes = comparePackages(base, head);
  const markdown = formatMarkdown(changes);

  core.setOutput('diff', markdown);
  core.setOutput('added_count', changes.added.length.toString());
  core.setOutput('removed_count', changes.removed.length.toString());
  core.setOutput('updated_count', changes.updated.length.toString());
}

if (require.main === module) {
  run();
}
