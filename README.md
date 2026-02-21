# npm-diff

A GitHub Action that generates a formatted diff of npm `package-lock.json` changes for pull requests. Perfect for reviewing dependency updates at a glance.

## Features

✅ **Works with reusable workflows** - No complex workarounds needed  
✅ **Supports npm v6 and v7+** - Handles both `dependencies` and `packages` formats  
✅ **Clean table output** - Formatted Markdown table matching composer-diff style  
✅ **Direct npm links** - One-click access to package pages and version comparisons  
✅ **Detailed metrics** - Outputs counts for added, removed, and upgraded packages

### Permissions

The action itself only requires read access to the repository contents to compare the lockfiles:

```yaml
permissions:
  contents: read
```

However, if you use a separate action to post the diff as a comment (like in the example below), you will also need:

```yaml
permissions:
  pull-requests: write
```

## Usage

### Basic Example

```yaml
name: Dependency Check

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  npm-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate npm lockfile diff
        id: npm_diff
        uses: stixx/npm-diff@v1
        with:
          base-ref: ${{ github.event.pull_request.base.ref || 'main' }}

      - name: Comment PR
        if: steps.npm_diff.outputs.has_changes == 'true'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: npm-diff
          message: |
            <details open>
            <summary>NPM package changes</summary>

            ${{ steps.npm_diff.outputs.diff }}

            </details>
```

### Advanced Example with Metrics

```yaml
- name: Generate npm lockfile diff
  id: npm_diff
  uses: stixx/npm-diff@v1
  with:
    base-ref: develop
    path: frontend/package-lock.json

- name: Comment with summary
  if: steps.npm_diff.outputs.has_changes == 'true'
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    header: npm-diff
    message: |
      ## 📦 NPM Dependency Changes

      **Summary:** ${{ steps.npm_diff.outputs.added_count }} added, ${{ steps.npm_diff.outputs.removed_count }} removed, ${{ steps.npm_diff.outputs.updated_count }} upgraded

      <details open>
      <summary>View details</summary>

      ${{ steps.npm_diff.outputs.diff }}

      </details>
```

### Use in Reusable Workflows

```yaml
# .github/workflows/reusable-dependency-check.yml
name: Dependency Check
on:
  workflow_call:

jobs:
  diff:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate npm diff
        id: npm_diff
        uses: stixx/npm-diff@v1

      - uses: marocchino/sticky-pull-request-comment@v2
        if: steps.npm_diff.outputs.has_changes == 'true'
        with:
          header: npm-diff
          message: |
            <details open>
            <summary>NPM package changes</summary>

            ${{ steps.npm_diff.outputs.diff }}

            </details>
```

## Inputs

| Input      | Description                                                    | Required | Default             |
| ---------- | -------------------------------------------------------------- | -------- | ------------------- |
| `base-ref` | Base branch reference for comparison (e.g., `main`, `develop`) | No       | `main`              |
| `path`     | Path to package-lock.json file                                 | No       | `package-lock.json` |

## Outputs

| Output          | Description                                 | Example           |
| --------------- | ------------------------------------------- | ----------------- |
| `has_changes`   | Whether package-lock.json has changes       | `true` or `false` |
| `diff`          | The formatted diff output as Markdown table | See example below |
| `added_count`   | Number of packages added                    | `5`               |
| `removed_count` | Number of packages removed                  | `2`               |
| `updated_count` | Number of packages updated                  | `12`              |

## Example Output

When used in a Pull Request, the action generates a summary and a detailed table of changes.

### PR Comment Example

## 📦 NPM Dependency Changes

**Summary:** 1 added, 0 removed, 2 upgraded

<details open>
<summary>View details</summary>

| Packages | Operation | Base      | Target    | Link                                                                |
| -------- | --------- | --------- | --------- | ------------------------------------------------------------------- |
| express  | Upgraded  | `4.17.1`  | `4.18.2`  | [Compare](https://www.npmjs.com/package/express?activeTab=versions) |
| lodash   | Upgraded  | `4.17.20` | `4.17.21` | [Compare](https://www.npmjs.com/package/lodash?activeTab=versions)  |
| axios    | Added     | -         | `1.4.0`   | [Compare](https://www.npmjs.com/package/axios?activeTab=versions)   |

</details>

## Requirements

- `actions/checkout@v4` with `fetch-depth: 0` (or at least `fetch-depth: 2` to access base branch)
- Node.js is available by default in GitHub Actions runners

## How It Works

1. Checks if `package-lock.json` exists at the specified path
2. Compares the lockfile between the base branch and current HEAD
3. Parses both versions (supports npm v6 `dependencies` and npm v7+ `packages` formats)
4. Identifies added, removed, and upgraded packages
5. Generates a formatted Markdown table with npm package links
6. Outputs the diff and metrics for use in subsequent steps

## Troubleshooting

### "No changes detected" but lockfile was modified

Ensure you're using `fetch-depth: 0` in your checkout step:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # Required to access base branch
```

### Custom lockfile path

If your `package-lock.json` is in a subdirectory:

```yaml
- uses: stixx/npm-diff@v1
  with:
    path: frontend/package-lock.json
```

### Different base branch

To compare against a branch other than `main`:

```yaml
- uses: stixx/npm-diff@v1
  with:
    base-ref: develop
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development

To run tests locally:

```bash
npm test
```

## License

MIT License - see LICENSE file for details

## Author

Created by [stixx](https://github.com/stixx)

## Related Actions

- [IonBazan/composer-diff-action](https://github.com/IonBazan/composer-diff-action) - Similar action for PHP Composer
- [marocchino/sticky-pull-request-comment](https://github.com/marocchino/sticky-pull-request-comment) - For posting diff comments
