# Bulk GitHub Repository Settings Sync Action

[![GitHub release](https://img.shields.io/github/release/joshjohanning/bulk-github-repo-settings-sync-action.svg?labelColor=333)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/releases)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-Bulk%20GitHub%20Repository%20Settings%20Sync-blue?logo=github)](https://github.com/marketplace/actions/bulk-github-repository-settings-sync)
[![CI](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/ci.yml/badge.svg)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/ci.yml)
[![Publish GitHub Action](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/publish.yml/badge.svg?branch=main&event=push)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/publish.yml)
![Coverage](./badges/coverage.svg)

Update repository settings in bulk across multiple GitHub repositories.

## Features

- 🔧 Update pull request merge strategies (squash, merge, rebase)
- ✅ Configure auto-merge settings
- 🗑️ Enable automatic branch deletion after merge
- 🔄 Configure pull request branch update suggestions
- 📊 Enable default CodeQL code scanning
- 🏷️ Manage repository topics
- 📦 **Sync dependabot.yml files** across repositories via pull requests
- 📦 **Sync package.json devDependencies and npm scripts** across repositories via pull requests
- 📝 Support multiple repository input methods (comma-separated, YAML file, or all org repos)
- 🔍 **Dry-run mode** with change preview and intelligent change detection
- 📋 **Per-repository overrides** via YAML configuration
- 📊 **Comprehensive logging** showing before/after values for all changes

## Usage Examples

### Basic Usage

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2,owner/repo3'
    allow-squash-merge: true
    allow-merge-commit: false
    delete-branch-on-merge: true
    enable-default-code-scanning: true
    topics: 'javascript,github-actions,automation'
    dry-run: ${{ github.event_name == 'pull_request' }} # dry run if PR
```

### Using YAML Configuration with Overrides

Create a `repos.yml` file:

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false # Override global setting
    topics: 'javascript,special-config'
  - repo: owner/repo2 # Uses global defaults
  - repo: owner/repo3
    enable-default-code-scanning: false
```

Use in workflow:

```yml
- name: Update Repository Settings with Overrides
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    # Global defaults (overridden per-repo in YAML)
    allow-squash-merge: true
    delete-branch-on-merge: true
    enable-default-code-scanning: true
    topics: 'javascript,github-actions'
```

### Syncing Dependabot Configuration

Sync a `dependabot.yml` file to `.github/dependabot.yml` in target repositories via pull requests:

```yml
- name: Sync Dependabot Config
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    dependabot-yml: './config/dependabot/npm-actions.yml'
    dependabot-pr-title: 'chore: update dependabot.yml'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    dependabot-yml: './config/dependabot/npm-actions.yml'
  - repo: owner/repo2
    dependabot-yml: './config/dependabot/python.yml'
  - repo: owner/repo3
    dependabot.yml: './github/dependabot.yml' # use the same config that this repo is using
```

**Behavior:**

- If `.github/dependabot.yml` doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- If content is identical, no PR is created
- PRs are created/updated using the GitHub API so commits are verified
- Updates existing open PRs instead of creating duplicates

### Syncing Package.json DevDependencies and Scripts

Sync `devDependencies` and/or `scripts` from a template `package.json` file to target repositories via pull requests:

```yml
- name: Sync Package.json Dependencies
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    package-json-file: './templates/package.json'
    sync-dev-dependencies: true
    sync-scripts: true
    package-json-pr-title: 'chore: update package.json'
```

You can sync just devDependencies or just scripts:

```yml
- name: Sync Only DevDependencies
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2'
    package-json-file: './templates/package.json'
    sync-dev-dependencies: true
    sync-scripts: false
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    package-json-file: './templates/node-project.json'
    sync-dev-dependencies: true
    sync-scripts: true
  - repo: owner/repo2
    package-json-file: './templates/typescript-project.json'
    sync-dev-dependencies: true
    sync-scripts: false
```

**Behavior:**

- Only updates existing `package.json` files (does not create new ones)
- Replaces entire `devDependencies` and/or `scripts` sections from the template
- Automatically runs `npm install` to update `package-lock.json` (when syncing devDependencies)
- Both files are committed in separate commits in the same PR
- PRs are created/updated using the GitHub API so commits are verified
- If content is identical, no PR is created
- Updates existing open PRs instead of creating duplicates

### Organization-wide Updates

```yml
- name: Update All Org Repositories
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'all'
    owner: 'my-organization'
    allow-squash-merge: true
    delete-branch-on-merge: true
```

### Dry-Run Mode

Preview changes without applying them:

```yml
- name: Preview Changes
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2'
    allow-squash-merge: true
    dry-run: true
    # dry-run true in PRs, false otherwise example:
    # dry-run: ${{ github.event_name == 'pull_request' }}
```

Output shows what would change:

```text
🔍 Would update owner/repo1
  📝 Settings changes:
     allow-squash-merge: false → true
     delete-branch-on-merge: false → true
  📦 Would create .github/dependabot.yml via PR
```

## Action Inputs

| Input                          | Description                                                                                                                                | Required | Default                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------ |
| `github-token`                 | GitHub token for API access (requires `repo` scope or GitHub App with repository administration)                                           | Yes      | -                              |
| `github-api-url`               | GitHub API URL (e.g., `https://api.github.com` for GitHub.com or `https://ghes.domain.com/api/v3` for GHES). Instance URL is auto-derived. | No       | `${{ github.api_url }}`        |
| `repositories`                 | Comma-separated list of repositories (`owner/repo`) or `"all"` for all org/user repos                                                      | No\*     | -                              |
| `repositories-file`            | Path to YAML file containing repository list                                                                                               | No\*     | -                              |
| `owner`                        | Owner (user or organization) name - required when using `repositories: "all"`                                                              | No       | -                              |
| `allow-squash-merge`           | Allow squash merging pull requests                                                                                                         | No       | -                              |
| `allow-merge-commit`           | Allow merge commits for pull requests                                                                                                      | No       | -                              |
| `allow-rebase-merge`           | Allow rebase merging pull requests                                                                                                         | No       | -                              |
| `allow-auto-merge`             | Allow auto-merge on pull requests                                                                                                          | No       | -                              |
| `delete-branch-on-merge`       | Automatically delete head branches after pull requests are merged                                                                          | No       | -                              |
| `allow-update-branch`          | Always suggest updating pull request branches                                                                                              | No       | -                              |
| `enable-default-code-scanning` | Enable default code scanning setup                                                                                                         | No       | -                              |
| `topics`                       | Comma-separated list of topics to set on repositories (replaces existing topics)                                                           | No       | -                              |
| `dependabot-yml`               | Path to a dependabot.yml file to sync to `.github/dependabot.yml` in target repositories                                                   | No       | -                              |
| `dependabot-pr-title`          | Title for pull requests when updating dependabot.yml                                                                                       | No       | `chore: update dependabot.yml` |
| `package-json-file`            | Path to a package.json file to use as source for syncing devDependencies and/or scripts                                                    | No       | -                              |
| `sync-dev-dependencies`        | Sync devDependencies from package-json-file to target repositories                                                                         | No       | `false`                        |
| `sync-scripts`                 | Sync npm scripts from package-json-file to target repositories                                                                             | No       | `false`                        |
| `package-json-pr-title`        | Title for pull requests when updating package.json                                                                                         | No       | `chore: update package.json`   |
| `dry-run`                      | Preview changes without applying them (logs what would be changed)                                                                         | No       | `false`                        |

\* Either `repositories` or `repositories-file` must be provided

## Action Outputs

| Output                 | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `updated-repositories` | Number of repositories successfully updated      |
| `failed-repositories`  | Number of repositories that failed to update     |
| `results`              | JSON array of update results for each repository |

## Authentication

### GitHub App (Recommended)

For better security and rate limits, use a GitHub App:

1. Create a GitHub App with the following permissions:
   - **Repository Administration**: Read and write (required for updating repository settings)
   - **Contents**: Read and write (required if syncing `dependabot.yml`)
   - **Pull Requests**: Read and write (required if syncing `dependabot.yml`)
2. Install it to your organization/repositories
3. Add `APP_ID` and `APP_PRIVATE_KEY` as repository secrets

```yml
- name: Generate GitHub App Token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}

- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    # ... other inputs
```

### Personal Access Token

Alternatively, use a PAT with `repo` scope:

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ secrets.PAT_TOKEN }}
    # ... other inputs
```

## YAML Configuration

The `repositories-file` supports both simple lists and per-repository overrides:

### Basic Format

```yaml
repos:
  - owner/repo1
  - owner/repo2
  - owner/repo3
```

### With Per-Repository Overrides

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false # Override global setting
    topics: 'javascript,custom-topic'
  - repo: owner/repo2 # Uses global defaults
  - repo: owner/repo3
    enable-default-code-scanning: false
    dependabot-yml: './github/dependabot-configs/custom-dependabot.yml'
  - repo: owner/repo4
    package-json-file: './templates/typescript-project.json'
    sync-dev-dependencies: true
    sync-scripts: true
```

**Priority:** Repository-specific settings override global defaults from action inputs.

## Important Notes

- Settings not specified will remain unchanged
- Topics **replace** all existing repository topics
- Dependabot.yml syncing creates pull requests for review before merging
- Dependabot.yml PRs use the GitHub API ensuring verified commits
- Package.json syncing **replaces** the entire `devDependencies` and/or `scripts` sections
- Package.json syncing only updates existing package.json files (does not create new ones)
- Package-lock.json is automatically updated when syncing devDependencies
- Failed updates are logged as warnings but don't fail the action
- **Access denied repositories are skipped with warnings** - ensure your GitHub App has:
  - Repository Administration permissions
  - Contents: Read and write (if syncing dependabot.yml or package.json)
  - Pull Requests: Read and write (if syncing dependabot.yml or package.json)
  - Is installed on all target repositories
- CodeQL scanning may not be available for all languages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and contribution guidelines.
