import * as fs from 'fs';
import * as core from '@actions/core';
import { PackageInfo, LockfileData } from './types';

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
        const directDeps = new Set<string>();
        const localPackageKeys = Object.keys(data.packages).filter(
          (key) => key === '' || !key.includes('node_modules')
        );

        for (const key of localPackageKeys) {
          const pkg = data.packages[key] as PackageInfo;
          if (pkg) {
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
          const name = key.replace(/^(.*node_modules\/)/, '');
          if (directDeps.has(name)) {
            // Only include top-level or first-level workspace node_modules, not nested transitive ones
            if (!key.match(/\/node_modules\/.*\/node_modules\//)) {
              packages[key] = info;
            }
          }
        }
      }
    } else if (data.dependencies || data.devDependencies || data.optionalDependencies) {
      core.debug('Detected lockfile v1 (dependencies found)');
      packages[''] = data as unknown as PackageInfo;

      const v1Deps = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
        ...(data.optionalDependencies || {}),
      };
      for (const [name, info] of Object.entries(v1Deps)) {
        packages[name] = info;
      }
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
