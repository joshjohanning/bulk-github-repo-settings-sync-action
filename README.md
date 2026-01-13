# Bulk GitHub Repository Settings Sync Action

[![GitHub release](https://img.shields.io/github/release/joshjohanning/bulk-github-repo-settings-sync-action.svg?labelColor=333)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/releases)
[![Immutable releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
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
- 🔒 **Enable or disable immutable releases** to prevent release deletion and modification
- 🏷️ Manage repository topics
- 🔄 **Sync dependabot.yml files** across repositories via pull requests
- 🔄 **Sync .gitignore files** across repositories via pull requests (preserves repo-specific content)
- 📋 **Sync repository rulesets** across repositories
- 📝 **Sync pull request templates** across repositories via pull requests
- 🔧 **Sync workflow files** across repositories via pull requests
- 🔗 **Sync autolink references** across repositories
- 🤖 **Sync copilot-instructions.md files** across repositories via pull requests
- 📦 **Sync package.json properties** (scripts, engines) across repositories via pull requests
- �📋 Support multiple repository input methods (comma-separated, YAML file, or all org repos)
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
    immutable-releases: true
    dependabot-yml: './config/dependabot/npm-actions.yml'
    rulesets-file: './config/rulesets/prod-ruleset.json'
    pull-request-template: './config/templates/pull_request_template.md'
    autolinks-file: './config/autolinks/jira-autolinks.json'
    copilot-instructions-md: './config/copilot/copilot-instructions.md'
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
    dependabot-yml: './.github/dependabot.yml' # use the same config that this repo is using
```

**Behavior:**

- If `.github/dependabot.yml` doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- If content is identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- Skips creating new PRs if an open PR already exists for the sync branch

### Syncing Repository Rulesets

Sync repository rulesets across multiple repositories:

```yml
- name: Sync Repository Rulesets
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    rulesets-file: './config/rulesets/ci-ruleset.json'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    rulesets-file: './config/rulesets/ci-ruleset.json'
  - repo: owner/repo2
    rulesets-file: './config/rulesets/prod-ruleset.json'
  - repo: owner/repo3
    # Skip ruleset sync for this repo
```

**Behavior:**

- Creates the ruleset if it doesn't exist in the repository
- Updates the ruleset if a ruleset with the same name already exists
- Ruleset is identified by the `name` field in the JSON configuration
- The JSON file should contain a valid ruleset configuration matching the [GitHub Rulesets API schema](https://docs.github.com/en/rest/repos/rules)

**Example Ruleset JSON (`ci-ruleset.json`):**

```json
{
  "name": "ci",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          {
            "context": "test",
            "integration_id": 15368
          }
        ]
      }
    },
    {
      "type": "non_fast_forward"
    }
  ]
}
```

For more information on ruleset configuration, see the [GitHub Rulesets documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

### Delete Unmanaged Rulesets

By default, syncing rulesets will create or update the specified ruleset by name, but will not delete other rulesets that may exist in the repository. To delete all other rulesets besides the one being synced, use the `delete-unmanaged-rulesets` parameter:

```yml
- name: Sync Repository Rulesets (delete unmanaged)
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    rulesets-file: './config/rulesets/ci-ruleset.json'
    delete-unmanaged-rulesets: true
```

**Behavior with `delete-unmanaged-rulesets: true`:**

- Creates the ruleset if it doesn't exist
- Updates the ruleset if a ruleset with the same name already exists
- **Deletes all other rulesets that don't match the synced ruleset name**
- In dry-run mode, shows which rulesets would be deleted without actually deleting them

**Use case:** This is useful when you rename a ruleset and want to ensure only the new ruleset exists, or when you want to enforce that repositories have exactly one specific ruleset configuration.

### Syncing Pull Request Templates

Sync a pull request template file to `.github/pull_request_template.md` in target repositories via pull requests:

```yml
- name: Sync Pull Request Template
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    pull-request-template: './config/templates/pull_request_template.md'
    pull-request-template-pr-title: 'chore: update pull request template'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    pull-request-template: './config/templates/standard-template.md'
  - repo: owner/repo2
    pull-request-template: './config/templates/feature-template.md'
  - repo: owner/repo3
    # Skip pull request template sync for this repo
```

**Behavior:**

- If `.github/pull_request_template.md` doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- If content is identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- Skips creating new PRs if an open PR already exists for the sync branch

For more information on pull request templates, see the [GitHub documentation](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).

### Syncing Workflow Files

Sync one or more workflow files to `.github/workflows/` in target repositories via pull requests:

```yml
- name: Sync Workflow Files
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    workflow-files: './config/workflows/ci.yml,./config/workflows/release.yml'
    workflow-files-pr-title: 'chore: sync workflow configuration'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    workflow-files: './config/workflows/ci.yml'
  - repo: owner/repo2
    workflow-files:
      - './config/workflows/ci.yml'
      - './config/workflows/release.yml'
  - repo: owner/repo3
    # Skip workflow files sync for this repo
```

**Behavior:**

- Syncs multiple workflow files in a single PR
- If a workflow file doesn't exist, it creates it
- If it exists but differs, it updates it via PR
- If all files are identical, no PR is created
- PRs are created/updated using the GitHub API so commits are verified
- Avoids creating duplicate PRs when one already exists
- Workflow files are synced to `.github/workflows/<filename>` (preserving the original filename)

For more information on GitHub Actions workflows, see the [GitHub Actions documentation](https://docs.github.com/en/actions/using-workflows).

### Syncing Autolink References

Sync autolink references across multiple repositories to automatically link keywords to external URLs (e.g., JIRA issues):

```yml
- name: Sync Autolinks
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    autolinks-file: './config/autolinks/jira-autolinks.json'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    autolinks-file: './config/autolinks/jira-autolinks.json'
  - repo: owner/repo2
    autolinks-file: './config/autolinks/ado-autolinks.json'
  - repo: owner/repo3
    # Skip autolinks sync for this repo
```

**Behavior:**

- Creates autolinks that don't exist in the repository
- Updates autolinks that have the same key prefix but different URL template or settings
- Deletes autolinks that exist in the repository but not in the configuration
- If all autolinks match, no changes are made
- Autolinks are applied directly via the GitHub API (not via pull request)

**Example Autolinks JSON (`jira-autolinks.json`):**

```json
{
  "autolinks": [
    {
      "key_prefix": "JIRA-",
      "url_template": "https://jira.example.com/browse/JIRA-<num>",
      "is_alphanumeric": false
    },
    {
      "key_prefix": "TICKET-",
      "url_template": "https://tickets.example.com/view/<num>",
      "is_alphanumeric": true
    }
  ]
}
```

| Field             | Description                                                                                  | Required             |
| ----------------- | -------------------------------------------------------------------------------------------- | -------------------- |
| `key_prefix`      | The prefix to match in text (e.g., `JIRA-` matches `JIRA-123`)                               | Yes                  |
| `url_template`    | The URL template with `<num>` placeholder for the reference number                           | Yes                  |
| `is_alphanumeric` | Whether the reference can include alphanumeric characters (`true`) or only numbers (`false`) | No (default: `true`) |

For more information on autolinks, see the [GitHub documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources).

### Syncing Copilot Instructions

Sync a `copilot-instructions.md` file to `.github/copilot-instructions.md` in target repositories via pull requests:

```yml
- name: Sync Copilot Instructions
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    copilot-instructions-md: './config/copilot/copilot-instructions.md'
    copilot-instructions-pr-title: 'chore: update copilot-instructions.md'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    copilot-instructions-md: './config/copilot/javascript-instructions.md'
  - repo: owner/repo2
    copilot-instructions-md: './config/copilot/python-instructions.md'
  - repo: owner/repo3
    copilot-instructions-md: './.github/copilot-instructions.md' # use the same config that this repo is using
```

**Behavior:**

- If `.github/copilot-instructions.md` doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- If content is identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- Skips creating new PRs if an open PR already exists for the sync branch

For more information on Copilot instructions, see the [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot).

### Syncing .gitignore Configuration

Sync a `.gitignore` file to `.gitignore` in target repositories via pull requests:

```yml
- name: Sync .gitignore Config
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    gitignore: './config/gitignore/.gitignore'
    gitignore-pr-title: 'chore: update .gitignore'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    gitignore: './config/gitignore/node.gitignore'
  - repo: owner/repo2
    gitignore: './config/gitignore/python.gitignore'
  - repo: owner/repo3
    gitignore: './.gitignore' # use the same config that this repo is using
```

**Behavior:**

- If `.gitignore` doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- **Repository-specific entries are preserved**: Content after a `# Repository-specific entries (preserved during sync)` marker is kept intact
- If content is identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- Skips creating new PRs if an open PR already exists for the sync branch

**Example: Preserving repo-specific entries**

In your target repository's `.gitignore`, you can add repository-specific entries that will be preserved during syncs:

```gitignore
# Standard entries (synced from source)
node_modules/
dist/
*.log

# Repository-specific entries (preserved during sync)
scanresults.json
twistlock-*.md
```

When the sync runs, it will update the standard entries from the source file while keeping `scanresults.json` and `twistlock-*.md` intact.

> **Note:** Do not include the marker comment `# Repository-specific entries (preserved during sync)` in your source `.gitignore` file. This marker should only exist in target repositories.

### Syncing package.json Properties

Sync npm `scripts` and/or `engines` from a source `package.json` to target repositories via pull requests:

```yml
- name: Sync package.json Properties
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    package-json-file: './config/package-json/package.json'
    sync-scripts: true
    sync-engines: true
    package-json-pr-title: 'chore: update package.json'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    package-json-file: './config/package-json/node-package.json'
    sync-scripts: true
    sync-engines: true
  - repo: owner/repo2
    # Only sync engines (e.g., for Node.js version upgrade)
    sync-engines: true
  - repo: owner/repo3
    # Skip package.json sync for this repo
```

**Behavior:**

- Only updates existing `package.json` files (does not create new ones)
- Merges selected fields (`scripts`, `engines`) while preserving all other fields
- If selected fields are identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- Skips creating new PRs if an open PR already exists for the sync branch

**Example source `package.json`:**

```json
{
  "scripts": {
    "test": "jest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

Only the fields you enable for syncing (`sync-scripts`, `sync-engines`) will be updated in target repositories. Other fields like `name`, `version`, `dependencies`, `devDependencies`, etc. will be preserved in the target.

> **Tip:** Use `sync-engines` to prepare your repositories for Node.js version upgrades (e.g., Node 20 → Node 22 before GitHub Actions deprecates Node 20 in April 2026).

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

| Input                            | Description                                                                                                                                | Required | Default                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- |
| `github-token`                   | GitHub token for API access (requires `repo` scope or GitHub App with repository administration)                                           | Yes      | -                                       |
| `github-api-url`                 | GitHub API URL (e.g., `https://api.github.com` for GitHub.com or `https://ghes.domain.com/api/v3` for GHES). Instance URL is auto-derived. | No       | `${{ github.api_url }}`                 |
| `repositories`                   | Comma-separated list of repositories (`owner/repo`) or `"all"` for all org/user repos                                                      | No\*     | -                                       |
| `repositories-file`              | Path to YAML file containing repository list                                                                                               | No\*     | -                                       |
| `owner`                          | Owner (user or organization) name - required when using `repositories: "all"`                                                              | No       | -                                       |
| `allow-squash-merge`             | Allow squash merging pull requests                                                                                                         | No       | -                                       |
| `allow-merge-commit`             | Allow merge commits for pull requests                                                                                                      | No       | -                                       |
| `allow-rebase-merge`             | Allow rebase merging pull requests                                                                                                         | No       | -                                       |
| `allow-auto-merge`               | Allow auto-merge on pull requests                                                                                                          | No       | -                                       |
| `delete-branch-on-merge`         | Automatically delete head branches after pull requests are merged                                                                          | No       | -                                       |
| `allow-update-branch`            | Always suggest updating pull request branches                                                                                              | No       | -                                       |
| `immutable-releases`             | Enable immutable releases to prevent release deletion and modification                                                                     | No       | -                                       |
| `enable-default-code-scanning`   | Enable default code scanning setup                                                                                                         | No       | -                                       |
| `topics`                         | Comma-separated list of topics to set on repositories (replaces existing topics)                                                           | No       | -                                       |
| `dependabot-yml`                 | Path to a dependabot.yml file to sync to `.github/dependabot.yml` in target repositories                                                   | No       | -                                       |
| `dependabot-pr-title`            | Title for pull requests when updating dependabot.yml                                                                                       | No       | `chore: update dependabot.yml`          |
| `gitignore`                      | Path to a .gitignore file to sync to `.gitignore` in target repositories (preserves repo-specific content after marker)                    | No       | -                                       |
| `gitignore-pr-title`             | Title for pull requests when updating .gitignore                                                                                           | No       | `chore: update .gitignore`              |
| `rulesets-file`                  | Path to a JSON file containing repository ruleset configuration to sync to target repositories                                             | No       | -                                       |
| `delete-unmanaged-rulesets`      | Delete all other rulesets besides the one being synced                                                                                     | No       | `false`                                 |
| `pull-request-template`          | Path to a pull request template file to sync to `.github/pull_request_template.md` in target repositories                                  | No       | -                                       |
| `pull-request-template-pr-title` | Title for pull requests when updating pull request template                                                                                | No       | `chore: update pull request template`   |
| `workflow-files`                 | Comma-separated list of workflow file paths to sync to `.github/workflows/` in target repositories                                         | No       | -                                       |
| `workflow-files-pr-title`        | Title for pull requests when updating workflow files                                                                                       | No       | `chore: sync workflow configuration`    |
| `autolinks-file`                 | Path to a JSON file containing autolink references to sync to target repositories                                                          | No       | -                                       |
| `copilot-instructions-md`        | Path to a copilot-instructions.md file to sync to `.github/copilot-instructions.md` in target repositories                                 | No       | -                                       |
| `copilot-instructions-pr-title`  | Title for pull requests when updating copilot-instructions.md                                                                              | No       | `chore: update copilot-instructions.md` |
| `package-json-file`              | Path to a package.json file to use as source for syncing scripts and/or engines                                                            | No       | -                                       |
| `sync-scripts`                   | Sync npm scripts from package-json-file to target repositories                                                                             | No       | `false`                                 |
| `sync-engines`                   | Sync engines field from package-json-file to target repositories (useful for Node.js version requirements)                                 | No       | `false`                                 |
| `package-json-pr-title`          | Title for pull requests when updating package.json                                                                                         | No       | `chore: update package.json`            |
| `dry-run`                        | Preview changes without applying them (logs what would be changed)                                                                         | No       | `false`                                 |

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
   - **Repository Administration**: Read and write (required for updating repository settings and rulesets)
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
    dependabot-yml: './config/dependabot/npm-actions.yml'
    rulesets-file: './config/rulesets/custom-ruleset.json'
    pull-request-template: './config/templates/feature-template.md'
    workflow-files:
      - './config/workflows/ci.yml'
      - './config/workflows/release.yml'
    autolinks-file: './config/autolinks/jira-autolinks.json'
    copilot-instructions-md: './config/copilot/custom-instructions.md'
```

**Priority:** Repository-specific settings override global defaults from action inputs.

## Important Notes

- Settings not specified will remain unchanged
- Topics **replace** all existing repository topics
- Dependabot.yml syncing creates pull requests for review before merging
- Dependabot.yml PRs use the GitHub API ensuring verified commits
- Pull request template syncing creates pull requests for review before merging
- Pull request templates are synced to `.github/pull_request_template.md` (standard location)
- Workflow files syncing creates pull requests for review before merging
- Workflow files are synced to `.github/workflows/<filename>` (preserving the original filename)
- Autolink references are synced directly via the API (autolinks not in config are **deleted** from repo)
- Failed updates are logged as warnings but don't fail the action
- **Access denied repositories are skipped with warnings** - ensure your GitHub App has:
  - Repository Administration permissions
  - Is installed on all target repositories
- CodeQL scanning may not be available for all languages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and contribution guidelines.
