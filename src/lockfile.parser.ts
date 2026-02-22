import * as fs from 'fs';
import * as core from '@actions/core';
import { PackageInfo, LockfileData } from './types';

export function parseLockfile(
  path: string,
  contentStr: string | null = null,
  includeTransitive: boolean = false
): Record<string, PackageInfo> {
  const normalizeV1Deps = (deps?: Record<string, PackageInfo | string>) => {
    const normalized: Record<string, string> = {};
    if (!deps) return normalized;
    for (const [name, info] of Object.entries(deps)) {
      if (info && typeof info === 'object' && 'version' in (info as object)) {
        normalized[name] = (info as PackageInfo).version as string;
      } else {
        normalized[name] = info as string;
      }
    }
    return normalized;
  };

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
            const normalizedPkg: PackageInfo = {
              ...pkg,
              dependencies: normalizeV1Deps(pkg.dependencies),
              devDependencies: normalizeV1Deps(pkg.devDependencies),
              optionalDependencies: normalizeV1Deps(pkg.optionalDependencies),
              peerDependencies: normalizeV1Deps(pkg.peerDependencies),
            };
            packages[key] = normalizedPkg;

            const deps = {
              ...(normalizedPkg.dependencies || {}),
              ...(normalizedPkg.devDependencies || {}),
              ...(normalizedPkg.optionalDependencies || {}),
              ...(normalizedPkg.peerDependencies || {}),
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

      // Properly construct the root PackageInfo
      packages[''] = {
        name: data.name as string,
        version: data.version as string,
        dependencies: normalizeV1Deps(data.dependencies as Record<string, PackageInfo | string>),
        devDependencies: normalizeV1Deps(
          data.devDependencies as Record<string, PackageInfo | string>
        ),
        optionalDependencies: normalizeV1Deps(
          data.optionalDependencies as Record<string, PackageInfo | string>
        ),
      };

      const v1Deps = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
        ...(data.optionalDependencies || {}),
      };

      for (const [name, info] of Object.entries(v1Deps)) {
        // Normalize v1 entries to string versions if they are objects
        if (info && typeof info === 'object' && 'version' in (info as object)) {
          packages[name] = (info as PackageInfo).version as string;
        } else {
          packages[name] = info as string;
        }
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
  } catch (err: unknown) {
    core.debug(`Failed to parse lockfile at ${path}`);
    if (err instanceof Error) {
      core.debug(err.message);
    }
    return {};
  }
}
