import * as fs from 'fs';
import * as core from '@actions/core';
import { GitService } from './git.service';
import { parseLockfile } from './lockfile.parser';
import { comparePackages } from './comparer';
import { formatMarkdown } from './formatter';
import { ActionInputs } from './types';

export class NpmDiffRunner {
  private git = new GitService();

  run(): void {
    const inputs = this.getInputs();
    core.debug(`Config: ${JSON.stringify(inputs)}`);

    if (!fs.existsSync(inputs.path)) {
      this.setEmptyOutputs(`_No package-lock.json found at ${inputs.path}_`);
      return;
    }

    let baseRevision: string;
    try {
      baseRevision = this.git.getMergeBase(inputs.baseRef);
      core.debug(`Base revision: ${baseRevision}`);
    } catch (err: unknown) {
      this.setEmptyOutputs(
        `_Error finding merge base. Ensure the repository is not a shallow clone._`
      );
      if (err instanceof Error) core.debug(err.message);
      return;
    }

    try {
      const changedFiles = this.git.getChangedFiles(baseRevision);
      const normalizedPath = inputs.path.replace(/^(\.\/)+/, '');

      if (!changedFiles.includes(normalizedPath)) {
        this.setEmptyOutputs(`_No changes to ${inputs.path}_`, false);
        return;
      }
    } catch (err: unknown) {
      this.setEmptyOutputs(`_Error running git diff._`);
      if (err instanceof Error) core.debug(err.message);
      return;
    }

    core.setOutput('has_changes', 'true');

    const baseContent = this.git.getFileAtRevision(baseRevision, inputs.path);
    const base = parseLockfile(inputs.path, baseContent || '{}', inputs.includeTransitive);
    const head = parseLockfile(inputs.path, null, inputs.includeTransitive);

    core.debug(`Packages: Base=${Object.keys(base).length}, Head=${Object.keys(head).length}`);

    const changes = comparePackages(base, head);
    const markdown = formatMarkdown(changes, inputs.includeTransitive);

    core.setOutput('diff', markdown);
    core.setOutput('added_count', changes.added.length.toString());
    core.setOutput('removed_count', changes.removed.length.toString());
    core.setOutput('updated_count', changes.updated.length.toString());
  }

  private getInputs(): ActionInputs {
    const get = (name: string) =>
      core.getInput(name) || process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';

    return {
      baseRef: get('base-ref') || 'main',
      path: get('path') || 'package-lock.json',
      includeTransitive: get('include-transitive') === 'true',
    };
  }

  private setEmptyOutputs(message: string, hasChanges: boolean = false): void {
    core.setOutput('has_changes', hasChanges ? 'true' : 'false');
    core.setOutput('diff', message);
    core.setOutput('added_count', '0');
    core.setOutput('removed_count', '0');
    core.setOutput('updated_count', '0');
  }
}

export function run(): void {
  new NpmDiffRunner().run();
}

if (
  (typeof require !== 'undefined' && require.main === module) ||
  (typeof process !== 'undefined' && process.argv[1]?.endsWith('action.ts'))
) {
  run();
}
