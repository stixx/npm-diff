import { Changes } from './types';

export function getCompareLink(
  packageName: string,
  oldVersion?: string,
  newVersion?: string
): string {
  const name = packageName.split('node_modules/').pop() || packageName;
  const encodedName = encodeURIComponent(name);

  if (oldVersion && newVersion && oldVersion !== '-' && newVersion !== '-') {
    const v1 = oldVersion.replace(/^[`^~]/, '').replace(/`$/, '');
    const v2 = newVersion.replace(/^[`^~]/, '').replace(/`$/, '');
    return `[Compare](https://npmdiff.dev/${encodedName}/${v1}/${v2}/)`;
  }

  return `[Details](https://www.npmjs.com/package/${encodedName}?activeTab=versions)`;
}

export function formatMarkdown(changes: Changes, includeTransitive: boolean = false): string {
  const total = changes.added.length + changes.removed.length + changes.updated.length;

  if (total === 0) {
    let msg = '_No package changes detected_';
    if (!includeTransitive) {
      msg +=
        '\n\nNote: Transitive dependencies are excluded. Use `include-transitive: true` to see all changes.';
    }
    msg +=
      '\n\nNote: If `package-lock.json` was modified, the changes might only affect metadata (like integrity hashes) or resolved URLs, rather than version numbers.';
    return msg;
  }

  let table = 'Packages | Operation | Base | Target | Link\n--- | --- | --- | --- | ---\n';

  const allChanges = [
    ...changes.added.map((p) => ({ ...p, op: 'Added', b: '-', t: `\`${p.version}\`` })),
    ...changes.removed.map((p) => ({ ...p, op: 'Removed', b: `\`${p.version}\``, t: '-' })),
    ...changes.updated.map((p) => ({
      ...p,
      op: 'Upgraded',
      b: `\`${p.oldVersion}\``,
      t: `\`${p.newVersion}\``,
    })),
  ];

  for (const row of allChanges) {
    const oldV = row.oldVersion || (row.op === 'Removed' ? row.version : undefined);
    const newV = row.newVersion || (row.op === 'Added' ? row.version : undefined);

    table += `${row.name} | ${row.op} | ${row.b} | ${row.t} | ${getCompareLink(row.name, oldV, newV)}\n`;
  }

  return table;
}
