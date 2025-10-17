# Bulk GitHub Repository Settings Action

Update repository settings in bulk across multiple GitHub repositories.

## Features  

- 🔧 Update pull request merge strategies (squash, merge, rebase)
- ✅ Configure auto-merge settings  
- 🗑️ Enable automatic branch deletion after merge
- 🔄 Configure pull request branch update suggestions
- 📊 Enable default CodeQL code scanning
- 🏷️ Manage repository topics
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
```

### Using YAML Configuration with Overrides

Create a `repos.yml` file:

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false  # Override global setting
    topics: 'javascript,special-config'
  - repo: owner/repo2  # Uses global defaults
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
```

Output shows what would change:

```text
🔍 Would update owner/repo1
  📝 Settings changes:
     allow-squash-merge: false → true
     delete-branch-on-merge: false → true
```

## Action Inputs

| Input                          | Description                                                                                      | Required | Default |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | -------- | ------- |
| `github-token`                 | GitHub token for API access (requires `repo` scope or GitHub App with repository administration) | Yes      | -       |
| `repositories`                 | Comma-separated list of repositories (`owner/repo`) or `"all"` for all org/user repos            | No\*     | -       |
| `repositories-file`            | Path to YAML file containing repository list                                                     | No\*     | -       |
| `owner`                        | Owner (user or organization) name - required when using `repositories: "all"`                    | No       | -       |
| `allow-squash-merge`           | Allow squash merging pull requests                                                               | No       | -       |
| `allow-merge-commit`           | Allow merge commits for pull requests                                                            | No       | -       |
| `allow-rebase-merge`           | Allow rebase merging pull requests                                                               | No       | -       |
| `allow-auto-merge`             | Allow auto-merge on pull requests                                                                | No       | -       |
| `delete-branch-on-merge`       | Automatically delete head branches after pull requests are merged                                | No       | -       |
| `allow-update-branch`          | Always suggest updating pull request branches                                                    | No       | -       |
| `enable-default-code-scanning` | Enable default code scanning setup                                                               | No       | -       |
| `topics`                       | Comma-separated list of topics to set on repositories (replaces existing topics)                 | No       | -       |
| `dry-run`                      | Preview changes without applying them (logs what would be changed)                               | No       | `false` |

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

1. Create a GitHub App with **Repository Administration** permissions
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
    allow-squash-merge: false  # Override global setting
    topics: 'javascript,custom-topic'
  - repo: owner/repo2  # Uses global defaults
  - repo: owner/repo3
    enable-default-code-scanning: false
```

**Priority:** Repository-specific settings override global defaults from action inputs.

## Important Notes

- Settings not specified will remain unchanged
- Topics **replace** all existing repository topics
- Failed updates are logged as warnings but don't fail the action
- Access denied repositories are skipped with warnings
- CodeQL scanning may not be available for all languages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and contribution guidelines.
