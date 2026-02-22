export interface PackageInfo {
  version?: string;
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface LockfileData {
  name?: string;
  version?: string;
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

export interface ActionInputs {
  baseRef: string;
  path: string;
  includeTransitive: boolean;
}
