# Live Integration Tests

This directory contains the live GitHub integration test harness.

These tests run against real repositories in the live test organization and
verify both:

- action outputs
- resulting GitHub state

## Requirements

These tests are destructive by design. They create, modify, archive, delete,
and reset repositories.

### Test Org

You must use a dedicated GitHub organization for these tests.

Requirements for that organization:

- It must exist before running the workflows.
- It must be used only for this test harness.
- Every repository in it should be considered temporary.
- Do not store anything important there.

### Token for the Test Org

In your own GitHub accounts settings, create a PAT (fine-grained personal access token).

The token should be created for the test org and have access to all
repositories in it.

Required token permissions:

- Resource owner:
  - `Test Org` (the name of your test org)
- Repository access:
  - `All repositories`
- Repository permissions:
  - `Administration: Read and write`
    - required for creating repos and changing repository settings/topics
  - `Contents: Read and write`
    - required for creating, updating, and deleting files during setup and assertions
  - `Pull requests: Read and write`
    - required for the PR-based file-sync scenarios
  - `Workflows: Read and write`
    - required because the harness resets and syncs files under `.github/workflows/`
- Organization permissions:
  - `Custom properties: Admin`
    - required because the repo-selection suite creates the custom-property schema and assigns repo values

### Setup in this action repository

In this action repository where the tests are run:

- Add a repository variable named `LIVE_TEST_ORG`.
- Add a fine-grained PAT secret named `LIVE_TEST_ORG_GH_TOKEN`.

`LIVE_TEST_ORG` is the repository variable name.
Its value must be the exact name of that dedicated test organization.

### Alternative: GitHub App (recommended for OSS)

Instead of a PAT, you can use a GitHub App installed only on the test org.
This limits the blast radius if the token is ever exposed.

1. Create a GitHub App with the same permissions listed above.
2. Install it on the test org only.
3. In this repository, set:
   - Variable `LIVE_TEST_APP_ID` — the App ID
   - Secret `LIVE_TEST_APP_PRIVATE_KEY` — the App private key

When `LIVE_TEST_APP_ID` is configured, the workflow generates an
installation token automatically and uses it instead of `LIVE_TEST_ORG_GH_TOKEN`.

## Usage

The integration tests are controlled by these workflows:

### [Live Integration Tests](../.github/workflows/live-integration.yml)

Trigger manually to run the live tests.

Inputs:

- `suite: all | main | selection | failure`
- `prepare-only: true|false`

`prepare-only: true` prepares the repositories for the selected suite(s)
without running the action assertions so the repositories can be inspected.

### [Delete Live Integration Test Repositories](../.github/workflows/delete-live-test-repositories.yml)

Trigger manually for development to delete all repositories of the test org.

Triple guarded to avoid accidental use.

## Test Suites

The workflow in [live-integration.yml](../.github/workflows/live-integration.yml)
runs three suites:

- `main`
  Covers repository settings, topics, file-sync features, and existing-PR /
  dry-run update paths.
- `selection`
  Covers repository selection modes such as explicit repo lists, `all`,
  custom properties, and rules-based selectors.
- `failure`
  Covers archived repositories and warning-producing invalid-input scenarios.

Each suite has a dedicated prepare job and a dedicated assertion job. The
workflow runs them sequentially to reduce the chance of hitting GitHub
secondary mutation limits.

## Layout

- [configs](../integration-test/configs)
  Rendered and template repository config files consumed by the action.
- [sources](../integration-test/sources)
  Source files synced into target repositories.
- [baselines](../integration-test/baselines)
  Reset-state fixtures used to prepare repositories before a live run.
- [expected](../integration-test/expected)
  Expected rendered outputs for assertions that compare against fixtures.
- [scripts](../integration-test/scripts)
  Prepare and assertion scripts used by the workflow.

## Coverage

The current live harness covers:

- Repository settings:
  `allow-squash-merge`, `allow-auto-merge`, `delete-branch-on-merge`,
  `allow-merge-commit`, `allow-rebase-merge`, `allow-update-branch`,
  `immutable-releases`, `code-scanning`, `secret-scanning`,
  `secret-scanning-push-protection`, `dependabot-alerts`,
  `dependabot-security-updates`
- Topics sync
- File sync:
  `dependabot-yml`, `.gitignore`, `rulesets-file`,
  `delete-unmanaged-rulesets`, `pull-request-template`, single-file and
  multi-file `workflow-files`, `autolinks-file`,
  `copilot-instructions-md`, `package-json-file`,
  `package-json-sync-scripts`, `package-json-sync-engines`,
  `codeowners-target-path` for `CODEOWNERS` and `docs/CODEOWNERS`,
  `codeowners-vars`
- Existing PR / branch update paths:
  generic `pr-up-to-date`, `pr-updated`, `pr-updated-created`,
  `pr-updated-mixed`, dry-run `would-update-pr`, package.json
  `pr-up-to-date`, package.json `pr-updated`, package.json dry-run
  `would-update-pr`
- Repo selection modes:
  explicit repo lists, `repositories: all`, direct custom-property
  filtering, rules with `selector.repos`, precedence overrides, and rules
  with `selector.all` plus `selector.custom-property`
- Failure and warning scenarios:
  archived repos, invalid CODEOWNERS target paths, invalid
  `autolinks-file`, invalid `rulesets-file`, invalid `package-json-file`,
  missing target `package.json`, and invalid `workflow-files`
- Higher-signal output assertions:
  PR metadata, dry-run file detail fields, ruleset and autolink result
  details, package.json `changes`, and warning payload fields

## Remaining Gaps

These areas are still intentionally not covered live:

- access denied / insufficient permissions behavior
- unreadable repository settings behavior
- a stable warning-producing security feature scenario
- exhaustive `results` payload-shape assertions for every feature family

Those gaps are either operationally awkward in the current single-org,
single-token setup or low-signal compared to their maintenance cost.
