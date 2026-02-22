import { execSync, StdioOptions } from 'child_process';
import * as core from '@actions/core';

export class GitService {
  private readonly maxBuffer = 50 * 1024 * 1024;

  execute(args: string[], options: { stdio?: StdioOptions; ignoreErrors?: boolean } = {}): string {
    core.debug(`Executing command: git ${args.join(' ')}`);
    try {
      return execSync(`git ${args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`, {
        maxBuffer: this.maxBuffer,
        stdio: options.stdio || ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch (err: unknown) {
      if (options.ignoreErrors) {
        if (err instanceof Error) {
          core.debug(`Command failed (ignored): ${err.message}`);
        }
        return '';
      }
      throw err;
    }
  }

  getMergeBase(baseRef: string): string {
    if (!/^[\w\-./]+$/.test(baseRef)) {
      throw new Error(`Invalid base-ref: ${baseRef}`);
    }

    try {
      // Try origin first
      return this.execute(['merge-base', `origin/${baseRef}`, 'HEAD']);
    } catch {
      // Fallback to local ref
      return this.execute(['merge-base', baseRef, 'HEAD']);
    }
  }

  getChangedFiles(baseRevision: string): string[] {
    const diff = this.execute(['diff', '--name-only', baseRevision, 'HEAD']);
    return diff
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  getFileAtRevision(revision: string, path: string): string {
    if (!/^[\w\-./]+$/.test(path)) {
      throw new Error(`Invalid path: ${path}`);
    }
    return this.execute(['show', `${revision}:${path}`], { ignoreErrors: true });
  }
}
