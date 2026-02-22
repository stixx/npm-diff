import { execSync, StdioOptions } from 'child_process';
import * as core from '@actions/core';

export class GitService {
  private readonly maxBuffer = 50 * 1024 * 1024;

  execute(command: string, options: { stdio?: StdioOptions; ignoreErrors?: boolean } = {}): string {
    core.debug(`Executing command: ${command}`);
    try {
      return execSync(command, {
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
    try {
      // Try origin first
      return this.execute(`git merge-base "origin/${baseRef}" HEAD`);
    } catch {
      // Fallback to local ref
      return this.execute(`git merge-base "${baseRef}" HEAD`);
    }
  }

  getChangedFiles(baseRevision: string): string[] {
    const diff = this.execute(`git diff --name-only "${baseRevision}" HEAD`);
    return diff
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  getFileAtRevision(revision: string, path: string): string {
    return this.execute(`git show "${revision}:${path}"`, { ignoreErrors: true });
  }
}
