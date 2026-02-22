import { PackageInfo, Changes, PackageChange } from './types';

export function comparePackages(
  base: Record<string, PackageInfo>,
  head: Record<string, PackageInfo>
): Changes {
  const changes: Changes = { added: [], removed: [], updated: [] };
  const baseKeys = Object.keys(base);
  const headKeys = Object.keys(head);
  const allKeys = new Set([...baseKeys, ...headKeys]);

  const resolvedChanges = new Map<string, PackageChange>();
  const depNameToPaths = new Map<string, string[]>();

  for (const key of allKeys) {
    const inBase = !!base[key];
    const inHead = !!head[key];
    const name = key.replace(/^(.*node_modules\/)/, '') || key;
    const displayName = key.startsWith('node_modules/')
      ? key.substring('node_modules/'.length)
      : key;

    // Skip local packages for resolved comparison
    if (!key.includes('node_modules')) continue;

    // Track which paths correspond to which dependency name
    if (!depNameToPaths.has(name)) {
      depNameToPaths.set(name, []);
    }
    depNameToPaths.get(name)?.push(key);

    const basePkg = base[key];
    const headPkg = head[key];

    if (inHead && !headPkg.version) continue;
    if (inBase && !basePkg.version && !inHead) continue;

    const baseVersion = basePkg?.version;
    const headVersion = headPkg?.version;

    if (!inBase && inHead) {
      resolvedChanges.set(key, { name: displayName, version: headVersion || 'unknown' });
    } else if (inBase && !inHead) {
      resolvedChanges.set(key, {
        name: displayName,
        version: baseVersion || 'unknown',
        oldVersion: baseVersion,
      });
    } else if (baseVersion !== headVersion) {
      resolvedChanges.set(key, {
        name: displayName,
        oldVersion: baseVersion,
        newVersion: headVersion,
      });
    }
  }

  // Constraint changes for local packages
  const localKeys = Array.from(allKeys).filter((k) => !k.includes('node_modules'));
  for (const key of localKeys) {
    const basePkg = base[key];
    const headPkg = head[key];

    const allDepNames = new Set([
      ...Object.keys(basePkg?.dependencies || {}),
      ...Object.keys(headPkg?.dependencies || {}),
      ...Object.keys(basePkg?.devDependencies || {}),
      ...Object.keys(headPkg?.devDependencies || {}),
      ...Object.keys(basePkg?.optionalDependencies || {}),
      ...Object.keys(headPkg?.optionalDependencies || {}),
      ...Object.keys(basePkg?.peerDependencies || {}),
      ...Object.keys(headPkg?.peerDependencies || {}),
    ]);

    for (const depName of allDepNames) {
      const getConstraint = (pkg?: PackageInfo) =>
        pkg?.dependencies?.[depName] ||
        pkg?.devDependencies?.[depName] ||
        pkg?.optionalDependencies?.[depName] ||
        pkg?.peerDependencies?.[depName];

      const baseConstraint = getConstraint(basePkg);
      const headConstraint = getConstraint(headPkg);

      // Check if this dependency already has a resolved change at any of its potential paths
      const hasResolvedChange = (depNameToPaths.get(depName) || []).some((path) =>
        resolvedChanges.has(path)
      );

      if (baseConstraint !== headConstraint && !hasResolvedChange) {
        changes.updated.push({
          name: depName,
          oldVersion: baseConstraint || '-',
          newVersion: headConstraint || '-',
        });
      }
    }
  }

  // Merge resolved changes
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
