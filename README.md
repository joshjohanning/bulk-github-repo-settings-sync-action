# Bulk GitHub Repository Settings Action

Update repository settings in bulk across multiple GitHub repositories.

## Features

- 🔧 Update pull request merge strategies (squash, merge, rebase)
- ✅ Configure auto-merge settings
- 🗑️ Enable automatic branch deletion after merge
- 🔄 Configure pull request branch update suggestions
- 📊 Enable default CodeQL code scanning
- 🏷️ Manage repository topics
- 📝 Support multiple repository input methods:
  - Comma-separated list
  - YAML configuration file
  - All repositories for a user/organization

## Key Features

- **Change Visibility**: Always shows before/after values for all changes, whether in dry-run or regular mode
- **Dry-Run Mode**: Preview changes without applying them - fetches current settings and shows diffs
- **Per-Repository Overrides**: Set global defaults in action inputs, override specific settings per repo in YAML
- **Intelligent Change Detection**: Only updates settings that actually differ from current values
- **Comprehensive Logging**: Clear output showing exactly what changed or would change

## Example Usage

### Basic Usage with Repository List

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2,owner/repo3'
    allow-squash-merge: true
    allow-merge-commit: false
    allow-rebase-merge: true
    allow-auto-merge: true
    delete-branch-on-merge: true
    allow-update-branch: true
    enable-default-code-scanning: true
    topics: 'javascript,github-actions,automation'
```

### Using a YAML Configuration File

Create a `repos.yml` file:

```yaml
repositories:
  - owner/repo1
  - owner/repo2
  - owner/repo3
```

Then use it in your workflow:

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    allow-squash-merge: true
    delete-branch-on-merge: true
    enable-default-code-scanning: true
```

### Using YAML File with Per-Repository Overrides

You can specify repository-specific settings that override the global defaults:

Create a `repos.yml` file:

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false
    allow-merge-commit: true
    topics: 'javascript,special-config'
  - repo: owner/repo2
    # This repo will use the global defaults from action inputs
  - repo: owner/repo3
    enable-default-code-scanning: false
```

Use in workflow with global defaults:

```yml
- name: Update Repository Settings with Overrides
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    # Global defaults (can be overridden per-repo in the YAML file)
    allow-squash-merge: true
    allow-merge-commit: false
    allow-rebase-merge: true
    delete-branch-on-merge: true
    enable-default-code-scanning: true
    topics: 'javascript,github-actions,automation'
```

### Sync Topics Across Repositories

```yml
- name: Sync Repository Topics
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2,owner/repo3'
    topics: 'javascript,github-actions,automation'
```

### Update All Repositories for an Organization

```yml
- name: Update All Org Repositories
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'all'
    owner: 'my-organization'
    allow-squash-merge: true
    delete-branch-on-merge: true
    enable-default-code-scanning: true
    topics: 'company-project,internal'
```

### Preview Changes with Dry-Run Mode

Preview what changes would be made without actually applying them. The action fetches current repository settings and shows what would change:

```yml
- name: Preview Repository Settings Changes
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2'
    allow-squash-merge: true
    allow-merge-commit: false
    delete-branch-on-merge: true
    topics: 'javascript,github-actions'
    dry-run: true
```

The dry-run mode:

- Fetches current repository settings via API
- Compares current values with desired values
- Logs all differences that would be changed
- Does not make any actual changes

Example output:

```
🔍 Would update owner/repo1
  📝 Settings changes:
     allow-squash-merge: false → true
     allow-merge-commit: true → false
     delete-branch-on-merge: false → true
  🏷️  Would add topics: javascript, github-actions
```

### Complete Example with GitHub App Token

> **Recommended:** Use a GitHub App token for better security and rate limits. See [GitHub App Authentication](#github-app-authentication) below.

```yml
name: Update Repository Settings

on:
  workflow_dispatch:

jobs:
  update-settings:
    runs-on: ubuntu-latest
    steps:
      - name: Generate GitHub App Token
        id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}

      - name: Update Repository Settings
        uses: joshjohanning/bulk-github-repo-settings-action@v1
        with:
          github-token: ${{ steps.app-token.outputs.token }}
          repositories: 'owner/repo1,owner/repo2'
          allow-squash-merge: true
          allow-merge-commit: false
          allow-rebase-merge: true
          allow-auto-merge: true
          delete-branch-on-merge: true
          allow-update-branch: true
          enable-default-code-scanning: true
          topics: 'javascript,github-actions,automation'
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

## GitHub App Authentication

**Recommended approach:** Use a GitHub App instead of a Personal Access Token (PAT) for better security, audit logging, and rate limits.

### Why Use a GitHub App?

- ✅ Better security with fine-grained permissions
- ✅ Higher rate limits
- ✅ Better audit logging
- ✅ Tokens expire automatically (1 hour)
- ✅ Can be scoped to specific repositories or organizations

### Setting Up a GitHub App

1. Create a GitHub App in your organization settings
2. Grant the app the following permissions:
   - Repository permissions:
     - **Administration**: Read and Write (for repository settings)
     - **Code scanning alerts**: Read and Write (for enabling CodeQL)
3. Install the app to your organization or specific repositories
4. Save the App ID and generate/download a private key
5. Add these as secrets to your repository:
   - `APP_ID`: Your GitHub App's ID
   - `APP_PRIVATE_KEY`: Your GitHub App's private key

### Generating a Token

Use the [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) action:

```yml
- name: Generate GitHub App Token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}

- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    # ... other inputs
```

### Alternative: Using a Personal Access Token

If you can't use a GitHub App, you can use a Personal Access Token (classic) or Fine-grained PAT with `repo` scope:

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-action@v1
  with:
    github-token: ${{ secrets.PAT_TOKEN }}
    # ... other inputs
```

## YAML File Format

The `repositories-file` uses a `repos` array format that supports both simple repository names and per-repository settings:

### Basic Format

For repositories that use all global defaults from the action inputs:

```yaml
repos:
  - owner/repo1
  - owner/repo2
  - owner/repo3
```

Or using the object format:

```yaml
repos:
  - repo: owner/repo1
  - repo: owner/repo2
  - repo: owner/repo3
```

### Format with Per-Repository Settings Overrides

You can override specific settings for individual repositories:

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false
    allow-merge-commit: true
    allow-rebase-merge: false
    allow-auto-merge: false
    delete-branch-on-merge: false
    allow-update-branch: false
    enable-default-code-scanning: false
    topics: 'javascript,custom-topic'
  - repo: owner/repo2
    # Uses global defaults from action inputs
  - repo: owner/repo3
    topics: 'different-topics,here'
    # Other settings use global defaults
```

You can also mix string and object formats in the same file:

```yaml
repos:
  - owner/repo1 # String format - uses all global defaults
  - repo: owner/repo2 # Object format - can include overrides
    allow-squash-merge: false
```

### Per-Repository Setting Priority

When using the `repos` array:

1. Settings specified in the YAML file for a specific repository take priority
2. If a setting is not specified for a repository, the global default from action inputs is used
3. This allows you to set common defaults in the action and override only specific settings for certain repos

- You must specify at least one setting to update (or enable CodeQL, or provide topics)
- Settings that are not specified will not be changed
- Each setting accepts `true` or `false` values
- Topics will **replace** all existing topics on the repository with the ones you specify
- Failed repository updates will be logged as warnings but won't fail the entire action
- The action provides a summary table showing the results for each repository
- CodeQL scanning may not be available for all repositories (e.g., unsupported languages) - these will show warnings but won't fail the action

## Development

### Development Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Make your changes to `src/index.js`
4. Run tests: `npm test`
5. Build the action: `npm run package`

### Available Scripts

- `npm test` - Run Jest tests
- `npm run lint` - Run ESLint
- `npm run format:write` - Format code with Prettier
- `npm run package` - Bundle the action with ncc
- `npm run all` - Run format, lint, test, coverage, and package

### Testing Locally

You can test the action locally by setting environment variables:

```bash
export INPUT_GITHUB_TOKEN="ghp_your_token_here"
export INPUT_REPOSITORIES="owner/repo1,owner/repo2"
export INPUT_ALLOW_SQUASH_MERGE="true"
export INPUT_DELETE_BRANCH_ON_MERGE="true"
export INPUT_ENABLE_CODE_SCANNING="true"
node src/index.js
```

## License

MIT
