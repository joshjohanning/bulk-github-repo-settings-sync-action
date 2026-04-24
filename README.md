# Bulk GitHub Repository Settings Sync Action

[![GitHub release](https://img.shields.io/github/release/joshjohanning/bulk-github-repo-settings-sync-action.svg?labelColor=333)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/releases)
[![Immutable releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-Bulk%20GitHub%20Repository%20Settings%20Sync-blue?logo=github)](https://github.com/marketplace/actions/bulk-github-repository-settings-sync)
[![CI](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/ci.yml/badge.svg)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/ci.yml)
[![Publish GitHub Action](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/publish.yml/badge.svg?branch=main&event=push)](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/actions/workflows/publish.yml)
![Coverage](./badges/coverage.svg)

Update repository settings in bulk across multiple GitHub repositories.

> [!TIP]
> **Looking for a working example?** See the [Working Example](#working-example) section for a complete workflow with GitHub App authentication and a real `repos.yml` configuration file.

## What's new

Please refer to the [release page](https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/releases) for the latest release notes.

## Features

- 🔧 Update pull request merge strategies (squash, merge, rebase)
- ✅ Configure auto-merge settings
- 🗑️ Enable automatic branch deletion after merge
- 🔄 Configure pull request branch update suggestions
- 📊 Enable default CodeQL code scanning
- 🔒 **Enable or disable immutable releases** to prevent release deletion and modification
- 🔍 **Enable or disable secret scanning** to detect exposed secrets
- 🛡️ **Enable or disable secret scanning push protection** to block commits with secrets
- 🤖 **Enable or disable Dependabot alerts** for vulnerability notifications
- 🔄 **Enable or disable Dependabot security updates** for automated security fixes
- 🏷️ Manage repository topics
- 🔄 **Sync dependabot.yml files** across repositories via pull requests
- 🔄 **Sync .gitignore files** across repositories via pull requests (preserves repo-specific content)
- 📋 **Sync repository rulesets** across repositories
- 📝 **Sync pull request templates** across repositories via pull requests
- 🔧 **Sync workflow files** across repositories via pull requests
- 🔗 **Sync autolink references** across repositories
- 🤖 **Sync copilot-instructions.md files** across repositories via pull requests
- 👥 **Sync CODEOWNERS files** across repositories via pull requests
- 📦 **Sync package.json properties** (scripts, engines) across repositories via pull requests
- 📋 Support multiple repository input methods (comma-separated, YAML file, or all org repos)
- 🎯 **Filter repositories by custom property values** for dynamic targeting
- 🔍 **Dry-run mode** with change preview and intelligent change detection
- 📋 **Per-repository overrides** via YAML configuration
- 📊 **Comprehensive logging** showing before/after values for all changes

## Usage Examples

### Basic Usage

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories: 'owner/repo1,owner/repo2,owner/repo3'
    allow-squash-merge: true
    allow-merge-commit: false
    delete-branch-on-merge: true
    immutable-releases: true
    code-scanning: true
    secret-scanning: true
    secret-scanning-push-protection: true
    private-vulnerability-reporting: true
    dependabot-alerts: true
    dependabot-security-updates: true
    dependabot-yml: './config/dependabot/npm-actions.yml'
    gitignore: './config/.gitignore'
    rulesets-file: './config/rulesets/prod-ruleset.json, ./config/rulesets/tag-protection.json'
    pull-request-template: './config/templates/pull_request_template.md'
    workflow-files: './config/workflows/ci.yml,./config/workflows/release.yml'
    autolinks-file: './config/autolinks/jira-autolinks.json'
    copilot-instructions-md: './config/copilot/copilot-instructions.md'
    codeowners: './config/CODEOWNERS'
    package-json-file: './config/package.json'
    topics: 'javascript,github-actions,automation'
    dry-run: ${{ github.event_name == 'pull_request' }} # dry run if PR
```

---

## Repository Selection Methods

This action supports two approaches for selecting which repositories to manage. Choose based on your organization's needs:

| Approach                                                                                      | Best For                                                                                         | Configuration File                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| [**Option 1: Repository List**](#option-1-repository-list-reposyml)                           | Small to medium orgs, explicit control over which repos are managed                              | `repos.yml` with `repos:` array           |
| [**Option 2: Rules-Based Selectors**](#option-2-rules-based-configuration-settings-configyml) | Large orgs, dynamic targeting by custom properties, different settings for different repo groups | `settings-config.yml` with `rules:` array |

---

### Option 1: Repository List (`repos.yml`)

List repositories explicitly in a YAML file. Supports per-repository setting overrides.

**Best for:** Explicit control over exactly which repositories are managed, with optional per-repo overrides.

> [!TIP]
> 📄 **See full example:** [sample-configuration/repos.yml](sample-configuration/repos.yml)

Create a `repos.yml` file:

```yaml
repos:
  - repo: owner/repo1
    allow-squash-merge: false # Override global setting
    topics: 'javascript,special-config'
  - repo: owner/repo2 # Uses global defaults
  - repo: owner/repo3
    code-scanning: false
```

**Optional: `base-path`**

Use the `base-path` top-level property to avoid repeating a common directory prefix for all file-path settings (e.g., `rulesets-file`, `dependabot-yml`, `gitignore`, `workflow-files`, `copilot-instructions-md`, `codeowners`, `package-json-file`, `pull-request-template`, `autolinks-file`). Relative paths in per-repo overrides are resolved relative to `base-path`. Absolute paths are left unchanged.

```yaml
base-path: './settings-sync/repos/'
repos:
  - repo: owner/repo1
    dependabot-yml: 'dependabot/npm-actions.yml' # resolved to ./settings-sync/repos/dependabot/npm-actions.yml
  - repo: owner/repo2
    rulesets-file: 'rulesets/branch-protection.json' # resolved to ./settings-sync/repos/rulesets/branch-protection.json
```

Use in workflow:

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    # Global defaults (overridden per-repo in YAML)
    allow-squash-merge: true
    delete-branch-on-merge: true
    code-scanning: true
    topics: 'javascript,github-actions'
```

**Also supports:**

- Comma-separated list: `repositories: 'owner/repo1,owner/repo2'`
- All org repos: `repositories: 'all'` with `owner: 'my-org'`
- Custom property filtering: `custom-property-name` and `custom-property-value` (comma-separated for multiple values) with `owner` (organizations only)

---

### Option 2: Rules-Based Configuration (`settings-config.yml`)

Define rules that target repositories using **selectors**. Each rule can use different selectors and apply different settings. This is the most powerful and scalable approach.

**Best for:** Large organizations, dynamic targeting by custom properties, applying different settings to different repository groups in a single workflow.

**Selector types:**

| Selector          | Description                                                       | Example                                                         |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `custom-property` | Filter by organization custom property values                     | `custom-property: { name: team, values: [platform, frontend] }` |
| `repos`           | Explicit list of repositories                                     | `repos: [my-org/repo1, my-org/repo2]`                           |
| `all`             | Target every repository for the owner                             | `all: true`                                                     |
| `fork`            | Filter matched repositories by fork status. Default: no filtering | `fork: true`                                                    |
| `visibility`      | Filter matched repositories by visibility. Default: no filtering  | `visibility: private`                                           |

> [!NOTE]
> 💡 **Extensibility:** The selector pattern is designed to support future possible selectors like `topics`, `name-prefix`, etc.

> [!NOTE]
> 🗄 Archived repositories are skipped.

> [!TIP]
> 📄 **See full example:** [sample-configuration/settings-config.yml](sample-configuration/settings-config.yml)

Create a `settings-config.yml` file:

```yaml
owner: my-org

rules:
  # Rule 1: Platform repos get strict security settings
  - selector:
      custom-property:
        name: team
        values: [platform]
    settings:
      code-scanning: true
      secret-scanning: true
      secret-scanning-push-protection: true
      private-vulnerability-reporting: true
      immutable-releases: true
      dependabot-yml: './config/dependabot/npm-actions.yml'

  # Rule 2: Frontend and backend repos get monitoring but not immutable releases
  - selector:
      custom-property:
        name: team
        values: [frontend, backend]
    settings:
      code-scanning: true
      secret-scanning: true

  # Rule 3: Specific repos get additional overrides
  - selector:
      repos:
        - my-org/special-repo
        - my-org/another-repo
      fork: false
      visibility: private
    settings:
      topics: 'special,monitored'
      dependabot-alerts: true

  # Rule 4: All forks get different Dependabot settings
  - selector:
      all: true
      fork: true
    settings:
      dependabot-alerts: false
      dependabot-security-updates: false
```

Use in workflow:

```yml
- name: Apply Rules-Based Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'settings-config.yml'
```

**Settings Merging:**

When a repository matches multiple rules, settings are merged in order. Later rules override earlier rules for the same setting:

```yaml
# If repo1 matches both rules:
rules:
  - selector:
      custom-property: { name: tier, values: [standard] }
    settings:
      code-scanning: true
      topics: 'standard'

  - selector:
      repos: [my-org/repo1]
    settings:
      topics: 'special,override' # This overrides 'standard'
      dependabot-alerts: true # This is added


# Result for repo1:
# code-scanning: true
# topics: 'special,override'
# dependabot-alerts: true
```

> **Note:** Custom properties are only available for GitHub organizations (not personal accounts) and must be configured at the organization level.

---

## Syncing Files and Configurations

The following sections describe how to sync various files and configurations across repositories. These work with both repository selection methods above.

### Syncing Dependabot Configuration

Sync a `dependabot.yml` file to `.github/dependabot.yml` in target repositories via pull requests:

```yml
- name: Sync Dependabot Config
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
- If an open PR already exists, updates the PR branch if the source content has changed

### Syncing Repository Rulesets

Sync repository rulesets across multiple repositories. Each ruleset is defined in its own JSON file, and `rulesets-file` accepts comma-separated paths to sync multiple rulesets:

```yml
- name: Sync Repository Rulesets
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    rulesets-file: './config/rulesets/branch-protection.json, ./config/rulesets/tag-protection.json'
```

Or with repo-specific overrides in `repos.yml` (supports comma-separated strings or YAML arrays):

```yaml
repos:
  - repo: owner/repo1
    rulesets-file: './config/rulesets/ci-ruleset.json'
  - repo: owner/repo2
    rulesets-file:
      - './config/rulesets/branch-protection.json'
      - './config/rulesets/tag-protection.json'
  - repo: owner/repo3
    # Skip ruleset sync for this repo
```

**Behavior:**

- Creates the ruleset if it doesn't exist in the repository
- Updates the ruleset if a ruleset with the same name already exists
- Rulesets are identified by the `name` field in each JSON configuration
- Each JSON file should contain a valid ruleset configuration matching the [GitHub Rulesets API schema](https://docs.github.com/en/rest/repos/rules)

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

By default, syncing rulesets will create or update the specified rulesets by name, but will not delete other rulesets that may exist in the repository. To delete all other rulesets besides those being synced, use the `delete-unmanaged-rulesets` parameter:

```yml
- name: Sync Repository Rulesets (delete unmanaged)
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    rulesets-file: './config/rulesets/branch-protection.json, ./config/rulesets/tag-protection.json'
    delete-unmanaged-rulesets: true
```

**Behavior with `delete-unmanaged-rulesets: true`:**

- Creates rulesets that don't exist
- Updates rulesets that differ from the config
- **Deletes all other rulesets not matching any managed ruleset name**
- In dry-run mode, shows which rulesets would be deleted without actually deleting them

**Use case:** This is useful when you rename a ruleset and want to ensure only the configured rulesets exist, or when you want to enforce that repositories have exactly the specified ruleset configurations.

### Syncing Pull Request Templates

Sync a pull request template file to `.github/pull_request_template.md` in target repositories via pull requests:

```yml
- name: Sync Pull Request Template
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
- If an open PR already exists, updates the PR branch if the source content has changed

For more information on pull request templates, see the [GitHub documentation](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).

### Syncing Workflow Files

Sync one or more workflow files to `.github/workflows/` in target repositories via pull requests:

```yml
- name: Sync Workflow Files
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
- PRs are created using the GitHub API so commits are verified
- If an open PR already exists, updates the PR branch if the source content has changed
- Workflow files are synced to `.github/workflows/<filename>` (preserving the original filename)

For more information on GitHub Actions workflows, see the [GitHub Actions documentation](https://docs.github.com/en/actions/using-workflows).

### Syncing Autolink References

Sync autolink references across multiple repositories to automatically link keywords to external URLs (e.g., JIRA issues):

```yml
- name: Sync Autolinks
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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

### Syncing Environments

Sync deployment environments across multiple repositories to standardize environment configurations (e.g., production, staging).

**Simple — just create named environments (inline):**

```yml
- name: Sync Environments
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    environments: production, staging, development
```

> [!NOTE]
> Inline `environments` only creates environments that don't already exist. Existing environments are left unchanged. Use `environments-file` when you need to manage environment settings (reviewers, wait timers, branch policies, etc.).

**Advanced — use a YAML/JSON file for full configuration:**

```yml
- name: Sync Environments
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    environments-file: './config/environments.yml'
    delete-unmanaged-environments: false
```

Both `environments` and `environments-file` can be combined — file entries override inline entries with the same name.

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    environments-file: './config/environments/web-environments.yml'
  - repo: owner/repo2
    environments-file: './config/environments/api-environments.yml'
  - repo: owner/repo3
    # Skip environments sync for this repo (empty list + no delete-unmanaged)
    environments: ''
```

**Behavior:**

- Creates environments that don't exist in the repository
- Updates environments that exist but have different settings (wait timer, reviewers, branch policy, etc.)
- Optionally deletes environments not included in the desired environment configuration for the repository (`delete-unmanaged-environments: true`)
- If all environments match, no changes are made
- Environments are applied directly via the GitHub API (not via pull request)

**Example Environments Config (`environments.yml`):**

```yaml
environments:
  - name: production
    wait_timer: 10
    prevent_self_review: true
    reviewers:
      - type: User
        login: joshjohanning
      - type: Team
        slug: platform-team
    deployment_branch_policy:
      protected_branches: true
      custom_branch_policies: false
    deployment_protection_rules:
      - app: deployment-gate-demo

  - name: staging
    wait_timer: 0
    deployment_branch_policy: null

  - name: development
```

| Field                                             | Description                                                         | Required |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| `name`                                            | The name of the environment                                         | Yes      |
| `wait_timer`                                      | Minutes to wait before allowing deployments to proceed (0-43200)    | No       |
| `prevent_self_review`                             | Whether to prevent the deployer from approving their own deployment | No       |
| `reviewers`                                       | Array of users or teams that must review deployments                | No       |
| `reviewers[].type`                                | `"User"` or `"Team"`                                                | Yes      |
| `reviewers[].id`                                  | The user or team ID (numeric)                                       | No\*     |
| `reviewers[].login`                               | Username (for `User` type) — resolved to ID via API                 | No\*     |
| `reviewers[].slug`                                | Team slug (for `Team` type) — resolved to ID via API                | No\*     |
| `deployment_branch_policy`                        | Branch restrictions for deployments (`null` for no restrictions)    | No       |
| `deployment_branch_policy.protected_branches`     | Whether only protected branches can deploy                          | No       |
| `deployment_branch_policy.custom_branch_policies` | Whether to use custom branch name policies                          | No       |
| `branch_name_patterns`                            | Array of custom branch name patterns to allow for deployment        | No\*\*   |
| `deployment_protection_rules`                     | Array of custom deployment gate apps                                | No       |
| `deployment_protection_rules[].app`               | App slug (resolved to integration ID via API)                       | Yes      |

\* Each reviewer must have either `id`, `login` (User), or `slug` (Team).

\*\* `branch_name_patterns` applies only when `deployment_branch_policy.custom_branch_policies` is `true`. If custom branch policies are enabled and `branch_name_patterns` is omitted, any existing custom branch patterns will be removed during sync.

> [!NOTE]
> When using `environments-file`, omitted optional fields are set to their defaults (e.g., `wait_timer: 0`, `reviewers: []`, `deployment_branch_policy: null`). This means existing environment settings will be updated to match the file configuration. To leave an existing environment unchanged, use the inline `environments` input instead — it only creates environments that don't already exist.

For more information on environments, see the [GitHub documentation](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).

### Syncing Copilot Instructions

Sync a `copilot-instructions.md` file to `.github/copilot-instructions.md` in target repositories via pull requests:

```yml
- name: Sync Copilot Instructions
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
- If an open PR already exists, updates the PR branch if the source content has changed

For more information on Copilot instructions, see the [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot).

### Syncing CODEOWNERS

Sync a `CODEOWNERS` file to target repositories via pull requests. CODEOWNERS files define who is responsible for reviewing changes to specific parts of a repository.

```yml
- name: Sync CODEOWNERS
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    codeowners: './config/CODEOWNERS'
    codeowners-target-path: '.github/CODEOWNERS' # default location
    codeowners-pr-title: 'chore: update CODEOWNERS'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    codeowners: './config/codeowners/frontend-codeowners'
  - repo: owner/repo2
    codeowners: './config/codeowners/backend-codeowners'
    codeowners-target-path: 'CODEOWNERS' # use root location instead
  - repo: owner/repo3
    codeowners: './.github/CODEOWNERS' # use the same config that this repo is using
```

**Using Template Variables:**

For dynamic CODEOWNERS content (e.g., different teams per repository), use template variables with `{{variable_name}}` syntax. This is useful when:

- Different teams own different repositories but you want a consistent CODEOWNERS structure
- You want to manage a single template file instead of maintaining separate CODEOWNERS files per team
- You're using rules-based configuration and want teams assigned automatically based on custom properties

Create a template file (`./config/CODEOWNERS.template`):

```text
# Default reviewers
* {{default_team}}

# Additional reviewers
* {{code_reviewers}}

# Specific paths
/docs/ {{docs_team}}
```

Then in `repos.yml`, specify the variables per repository:

```yaml
repos:
  - repo: owner/frontend-app
    codeowners: './config/CODEOWNERS.template'
    codeowners-vars:
      default_team: '@owner/frontend-team'
      code_reviewers: '@owner/senior-devs'
      docs_team: '@owner/docs-team'
  - repo: owner/backend-api
    codeowners: './config/CODEOWNERS.template'
    codeowners-vars:
      default_team: '@owner/backend-team'
      code_reviewers: '@owner/platform-leads'
      docs_team: '@owner/docs-team'
```

Or with rules-based configuration in `settings-config.yml` (recommended for larger organizations - new repos automatically get the right CODEOWNERS based on their custom property):

```yaml
rules:
  - selector:
      custom-property:
        name: team
        values: [platform]
    settings:
      codeowners: './config/CODEOWNERS.template'
      codeowners-vars:
        default_team: '@owner/platform-team'
        code_reviewers: '@owner/platform-leads'
```

**Supported target paths:**

| Path                 | Description                    |
| -------------------- | ------------------------------ |
| `.github/CODEOWNERS` | Default location (recommended) |
| `CODEOWNERS`         | Repository root                |
| `docs/CODEOWNERS`    | Inside the docs directory      |

**Behavior:**

- If the CODEOWNERS file doesn't exist, it creates it and opens a PR
- If it exists but differs, it updates it via PR
- If content is identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- If an open PR already exists, updates the PR branch if the source content has changed

For more information on CODEOWNERS, see the [GitHub documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

### Syncing .gitignore Configuration

Sync a `.gitignore` file to `.gitignore` in target repositories via pull requests:

```yml
- name: Sync .gitignore Config
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
- If an open PR already exists, updates the PR branch if the source content has changed

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
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    repositories-file: 'repos.yml'
    package-json-file: './config/package-json/package.json'
    package-json-sync-scripts: true
    package-json-sync-engines: true
    package-json-pr-title: 'chore: update package.json'
```

Or with repo-specific overrides in `repos.yml`:

```yaml
repos:
  - repo: owner/repo1
    package-json-file: './config/package-json/node-package.json'
    package-json-sync-scripts: true
    package-json-sync-engines: true
  - repo: owner/repo2
    # Only sync engines (e.g., for Node.js version upgrade)
    package-json-sync-engines: true
  - repo: owner/repo3
    # Skip package.json sync for this repo
```

**Behavior:**

- Only updates existing `package.json` files (does not create new ones)
- Merges selected fields (`scripts`, `engines`) while preserving all other fields
- If selected fields are identical, no PR is created
- PRs are created using the GitHub API so commits are verified
- If an open PR already exists, updates the PR branch if the source content has changed

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

Only the fields you enable for syncing (`package-json-sync-scripts`, `package-json-sync-engines`) will be updated in target repositories. Other fields like `name`, `version`, `dependencies`, `devDependencies`, etc. will be preserved in the target.

> **Tip:** Use `package-json-sync-engines` to prepare your repositories for Node.js version upgrades (e.g., Node 20 → Node 22 before GitHub Actions deprecates Node 20 in April 2026).

### Organization-wide Updates

```yml
- name: Update All Org Repositories
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
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

### Stale Sync PR Cleanup

When syncing files via pull request (dependabot.yml, .gitignore, workflow files, etc.), the action automatically closes stale PRs if the source file has been reverted to match the target. This prevents orphaned PRs from accumulating when configuration changes are rolled back.

**How it works:**

- When the action detects "no changes needed" (source matches target), it checks for open PRs on the sync branch
- Only PRs created by the same user/app running the action are closed (PRs from other authors are skipped with a warning)
- A comment is added explaining why the PR was closed, and the sync branch is deleted if no other open PRs remain on it
- In dry-run mode, the action reports which PRs would be closed without taking action

> [!NOTE]
> This feature requires the token to have **pull-requests: write** and **issues: write** permissions (for adding the closing comment). GitHub App tokens and PATs with `repo` scope include both.

## Action Inputs

| Input                             | Description                                                                                                                                 | Required | Default                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| `github-token`                    | GitHub token for API access (requires `repo` scope or GitHub App with repository administration)                                            | Yes      | -                                         |
| `github-api-url`                  | GitHub API URL (e.g., `https://api.github.com` for GitHub.com or `https://ghes.domain.com/api/v3` for GHES). Instance URL is auto-derived.  | No       | `${{ github.api_url }}`                   |
| `repositories`                    | Comma-separated list of repositories (`owner/repo`) or `"all"` for all org/user repos                                                       | No\*     | -                                         |
| `repositories-file`               | Path to YAML file containing repository list                                                                                                | No\*     | -                                         |
| `owner`                           | Owner (user or organization) name - required when using `repositories: "all"` or custom property filtering                                  | No       | -                                         |
| `custom-property-name`            | Name of the custom property to filter repositories by (organizations only)                                                                  | No       | -                                         |
| `custom-property-value`           | Comma-separated list of custom property values to match (used with `custom-property-name`)                                                  | No       | -                                         |
| `allow-squash-merge`              | Allow squash merging pull requests                                                                                                          | No       | -                                         |
| `squash-merge-commit-title`       | Default title for squash merge commits (`PR_TITLE`, `COMMIT_OR_PR_TITLE`)                                                                   | No       | -                                         |
| `squash-merge-commit-message`     | Default message for squash merge commits (`PR_BODY`, `COMMIT_MESSAGES`, `BLANK`)                                                            | No       | -                                         |
| `allow-merge-commit`              | Allow merge commits for pull requests                                                                                                       | No       | -                                         |
| `merge-commit-title`              | Default title for merge commits (`PR_TITLE`, `MERGE_MESSAGE`)                                                                               | No       | -                                         |
| `merge-commit-message`            | Default message for merge commits (`PR_TITLE`, `PR_BODY`, `BLANK`)                                                                          | No       | -                                         |
| `allow-rebase-merge`              | Allow rebase merging pull requests                                                                                                          | No       | -                                         |
| `allow-auto-merge`                | Allow auto-merge on pull requests                                                                                                           | No       | -                                         |
| `delete-branch-on-merge`          | Automatically delete head branches after pull requests are merged                                                                           | No       | -                                         |
| `allow-update-branch`             | Always suggest updating pull request branches                                                                                               | No       | -                                         |
| `immutable-releases`              | Enable immutable releases to prevent release deletion and modification                                                                      | No       | -                                         |
| `code-scanning`                   | Enable or disable default code scanning setup                                                                                               | No       | -                                         |
| `secret-scanning`                 | Enable or disable secret scanning                                                                                                           | No       | -                                         |
| `secret-scanning-push-protection` | Enable or disable secret scanning push protection                                                                                           | No       | -                                         |
| `private-vulnerability-reporting` | Enable or disable private vulnerability reporting                                                                                           | No       | -                                         |
| `dependabot-alerts`               | Enable or disable Dependabot alerts (vulnerability alerts)                                                                                  | No       | -                                         |
| `dependabot-security-updates`     | Enable or disable Dependabot security updates (automated security fixes)                                                                    | No       | -                                         |
| `topics`                          | Comma-separated list of topics to set on repositories (replaces existing topics)                                                            | No       | -                                         |
| `dependabot-yml`                  | Path to a dependabot.yml file to sync to `.github/dependabot.yml` in target repositories                                                    | No       | -                                         |
| `dependabot-pr-title`             | Title for pull requests when updating dependabot.yml                                                                                        | No       | `chore: update dependabot.yml`            |
| `gitignore`                       | Path to a .gitignore file to sync to `.gitignore` in target repositories (preserves repo-specific content after marker)                     | No       | -                                         |
| `gitignore-pr-title`              | Title for pull requests when updating .gitignore                                                                                            | No       | `chore: update .gitignore`                |
| `rulesets-file`                   | Comma-separated paths to JSON files, each containing a repository ruleset configuration to sync to target repositories                      | No       | -                                         |
| `delete-unmanaged-rulesets`       | Delete all other rulesets besides those being synced                                                                                        | No       | `false`                                   |
| `pull-request-template`           | Path to a pull request template file to sync to `.github/pull_request_template.md` in target repositories                                   | No       | -                                         |
| `pull-request-template-pr-title`  | Title for pull requests when updating pull request template                                                                                 | No       | `chore: update pull request template`     |
| `workflow-files`                  | Comma-separated list of workflow file paths to sync to `.github/workflows/` in target repositories                                          | No       | -                                         |
| `workflow-files-pr-title`         | Title for pull requests when updating workflow files                                                                                        | No       | `chore: sync workflow configuration`      |
| `autolinks-file`                  | Path to a JSON file containing autolink references to sync to target repositories                                                           | No       | -                                         |
| `environments`                    | Comma-separated list of environment names to create (e.g., `production, staging, development`)                                              | No       | -                                         |
| `environments-file`               | Path to a YAML or JSON file with detailed environment configurations (reviewers, wait timers, branch policies, deployment protection rules) | No       | -                                         |
| `delete-unmanaged-environments`   | Delete environments not included in the configured environments                                                                             | No       | `false`                                   |
| `copilot-instructions-md`         | Path to a copilot-instructions.md file to sync to `.github/copilot-instructions.md` in target repositories                                  | No       | -                                         |
| `copilot-instructions-pr-title`   | Title for pull requests when updating copilot-instructions.md                                                                               | No       | `chore: update copilot-instructions.md`   |
| `codeowners`                      | Path to a CODEOWNERS file to sync to target repositories                                                                                    | No       | -                                         |
| `codeowners-target-path`          | Target path for the CODEOWNERS file (`.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS`)                                              | No       | `.github/CODEOWNERS`                      |
| `codeowners-pr-title`             | Title for pull requests when updating CODEOWNERS                                                                                            | No       | `chore: update CODEOWNERS`                |
| `package-json-file`               | Path to a package.json file to use as source for syncing scripts and/or engines                                                             | No       | -                                         |
| `package-json-sync-scripts`       | Sync npm scripts from package-json-file to target repositories                                                                              | No       | `true`                                    |
| `package-json-sync-engines`       | Sync engines field from package-json-file to target repositories (useful for Node.js version requirements)                                  | No       | `true`                                    |
| `package-json-pr-title`           | Title for pull requests when updating package.json                                                                                          | No       | `chore: update package.json`              |
| `dry-run`                         | Preview changes without applying them (logs what would be changed)                                                                          | No       | `false`                                   |
| `write-job-summary`               | Write a summary table to the GitHub Actions job summary                                                                                     | No       | `true`                                    |
| `summary-heading`                 | Custom heading for the GitHub Actions job summary                                                                                           | No       | `Bulk Repository Settings Update Results` |

\* Repository selection: Use `repositories` (comma-separated list or `"all"`), `repositories-file`, or custom property filtering (`owner` + `custom-property-name` + `custom-property-value`)

### Default Commit Message Settings

The `squash-merge-commit-title`/`squash-merge-commit-message` and `merge-commit-title`/`merge-commit-message` inputs map to the GitHub API fields that control the default commit message when merging PRs. These correspond to the dropdown options in the repository settings UI:

**Squash merge options:**

| UI Option                             | `squash-merge-commit-title` | `squash-merge-commit-message` |
| ------------------------------------- | --------------------------- | ----------------------------- |
| Default message                       | `COMMIT_OR_PR_TITLE`        | `COMMIT_MESSAGES`             |
| Pull request title                    | `PR_TITLE`                  | `BLANK`                       |
| Pull request title and commit details | `PR_TITLE`                  | `COMMIT_MESSAGES`             |
| Pull request title and description    | `PR_TITLE`                  | `PR_BODY`                     |

**Merge commit options:**

| UI Option                          | `merge-commit-title` | `merge-commit-message` |
| ---------------------------------- | -------------------- | ---------------------- |
| Default message                    | `MERGE_MESSAGE`      | `PR_TITLE`             |
| Pull request title                 | `PR_TITLE`           | `BLANK`                |
| Pull request title and description | `PR_TITLE`           | `PR_BODY`              |

> [!NOTE]
> The GitHub API requires `*-commit-title` when `*-commit-message` is set. If you only specify a message, the action will automatically include the current title to satisfy this requirement.

## Action Outputs

| Output                   | Description                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `updated-repositories`   | Number of repositories successfully processed (changed + unchanged)                                |
| `changed-repositories`   | Number of repositories with reportable changes or pending sync PRs (or would have in dry-run mode) |
| `unchanged-repositories` | Number of repositories with no reportable changes (may include warnings)                           |
| `failed-repositories`    | Number of repositories that failed to update                                                       |
| `warning-repositories`   | Number of repositories that emitted warnings                                                       |
| `results`                | JSON array of update results for each repository                                                   |

## Authentication

### GitHub App (Recommended)

For better security and rate limits, use a GitHub App:

1. Create a GitHub App with the following permissions:
   - **Repository Administration**: Read and write (required for updating repository settings and rulesets)
   - **Contents**: Read and write (required if syncing `dependabot.yml`)
   - **Pull Requests**: Read and write (required if syncing `dependabot.yml`)
   - **Organization Custom Properties**: Read (required when using organization custom property filtering, including `custom-property` selectors in `settings-config.yml` or the `custom-property-name` / `custom-property-value` action inputs)
2. Install it to your organization/repositories
3. Add `APP_CLIENT_ID` as a repository variable and `APP_PRIVATE_KEY` as a repository secret

```yml
- name: Generate GitHub App Token
  id: app-token
  uses: actions/create-github-app-token@v3
  with:
    client-id: ${{ vars.APP_CLIENT_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}

- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    # ... other inputs
```

### Personal Access Token

Alternatively, use a PAT with `repo` scope:

```yml
- name: Update Repository Settings
  uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
  with:
    github-token: ${{ secrets.PAT_TOKEN }}
    # ... other inputs
```

## Working Example

For a complete working example of this action in use, see the [sync-github-repo-settings](https://github.com/joshjohanning/sync-github-repo-settings) repository:

- **[repos.yml](https://github.com/joshjohanning/sync-github-repo-settings/blob/main/repos.yml)** - Example configuration file with per-repository overrides for topics, dependabot, rulesets, workflow files, gitignore, and copilot instructions
- **[sync-github-repo-settings.yml](https://github.com/joshjohanning/sync-github-repo-settings/blob/main/.github/workflows/sync-github-repo-settings.yml)** - Example workflow using a GitHub App token

**Example workflow:**

```yml
name: sync-github-repo-settings

on:
  push:
    branches: ['main']
  pull_request:
    branches: ['main']
  workflow_dispatch:

jobs:
  sync-github-repo-settings:
    runs-on: ubuntu-latest
    if: github.actor != 'dependabot[bot]'
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v6

      - uses: actions/create-github-app-token@v3
        id: app-token
        with:
          client-id: ${{ vars.APP_CLIENT_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}

      - name: Update Repository Settings
        uses: joshjohanning/bulk-github-repo-settings-sync-action@v2
        with:
          github-token: ${{ steps.app-token.outputs.token }}
          repositories-file: 'repos.yml'
          allow-squash-merge: true
          allow-merge-commit: false
          allow-rebase-merge: false
          allow-auto-merge: true
          delete-branch-on-merge: true
          allow-update-branch: true
          code-scanning: true
          dependabot-pr-title: 'chore: update dependabot.yml'
          dry-run: ${{ github.event_name == 'pull_request' }} # dry run if PR
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
    code-scanning: false
    dependabot-yml: './config/dependabot/npm-actions.yml'
    rulesets-file:
      - './config/rulesets/branch-protection.json'
      - './config/rulesets/custom-ruleset.json'
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
