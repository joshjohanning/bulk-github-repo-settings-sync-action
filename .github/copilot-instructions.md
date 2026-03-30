# GitHub Copilot Instructions for Node.js Actions

<!-- This file is managed by joshjohanning/sync-github-repo-settings. Do not edit directly — changes will be overwritten. -->

## Project Overview

This is a Node.js GitHub Action with ESLint, Prettier, Jest testing, and ncc bundling. Follow these guidelines when making changes.

## Critical Rules

These rules prevent CI failures and broken releases. **Never skip them.**

- **MUST:** Run `npm run all` before committing. This runs format, lint, test, package, and badge generation. Fix any failures before proceeding.
- **MUST:** Bump `package.json` version when the published artifact changes: action behavior, runtime requirements, production dependencies, inputs/outputs, or bundled code. Do **not** bump for docs-only, tests-only, CI-only, or devDependency-only changes.
- **MUST:** When bumping versions or changing dependencies, run `npm install` first to sync `package-lock.json`, then run `npm run all`. A mismatched lockfile breaks CI.
- **MUST:** Update `README.md` and `action.yml` when adding, removing, or changing inputs, outputs, or behavior. Keep usage examples in the README in sync with `action.yml`.
- **MUST:** When updating Node.js support, update `runs.using` in `action.yml`, `engines.node` in `package.json`, and CI matrices together.
- **MUST:** If the action calls GitHub APIs, support GitHub.com, GHES, and GHEC-DR using a `github-api-url` input with default `${{ github.api_url }}`.
- **NEVER:** Log tokens, secrets, or authenticated URLs. Use `core.setSecret()` to mask sensitive values.
- **NEVER:** Use `console.log` or `console.error`. Use `core.info()`, `core.warning()`, `core.error()`, and `core.debug()` instead.

## Action Entry Point Pattern

- Main logic lives in `src/index.js` with an async `run()` function and top-level try/catch
- Use `core.setFailed(error.message)` in the catch block — do not use `process.exit(1)`
- Export helper functions for testability
- If the action calls GitHub APIs, initialize Octokit with `baseUrl` for GHES/GHEC-DR support

## Input and Output Handling

### Inputs

- Use `core.getInput()` for string inputs and `core.getBooleanInput()` for boolean inputs
- Validate inputs early in the function
- Log input values for debugging (except sensitive data)
- Every input in `action.yml` must be documented in the README

### Outputs

- Set outputs using `core.setOutput()`
- Output names must match what's defined in `action.yml`

## Error Handling

- Use `core.setFailed()` for fatal action failures
- Use `core.warning()` for non-fatal issues
- Check `error.status` for API errors — don't match on error message strings
- Catch errors at call boundaries; let helper functions throw contextual errors rather than calling `core.setFailed()` directly

## GitHub API Usage

### Octokit Initialization

- Initialize with `baseUrl` for GHES/GHEC-DR support: `new Octokit({ auth: token, baseUrl: apiUrl })`
- GHES/GHE documentation doesn't typically need to be called out separately in the README unless there are specific differences to highlight

### Pagination

- Use `octokit.paginate()` for any endpoint that returns a list

### Rate Limiting

- When iterating across many repos/resources, avoid unbounded parallel API calls — batch or serialize to reduce rate-limit pressure

## Logging and Job Summaries

### Structured Logging

- Use `core.info()` for normal output, `core.debug()` for verbose details
- Use `core.startGroup()` / `core.endGroup()` for collapsible log sections when processing multiple items

### Job Summaries

- Use `core.summary` to add rich output to the Actions UI when summarizing key data or findings

## Security

- If the action performs git operations with tokens, sanitize error messages to strip embedded credentials before logging
- Follow principle of least privilege for token permissions
- Document required permissions in the README
- Document when using a GitHub App would be more appropriate than `github.token` or a PAT

## Testing

### Jest with ES Modules

- Use `jest.unstable_mockModule()` for ESM mocking — mocks must be registered **before** dynamic imports:

  ```javascript
  jest.unstable_mockModule('@actions/core', () => ({
    getInput: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
    info: jest.fn(),
    warning: jest.fn()
  }));

  const core = await import('@actions/core');
  const { functionToTest } = await import('../src/index.js');
  ```

### Test Environment Setup

- Set `process.env` variables **before** importing the module under test when the module validates config at load time
- Reset mocks and environment between tests

### What to Test

- Test both success and error paths
- Assert `core.setFailed`, `core.warning`, and `core.setOutput` calls explicitly
- Mock external dependencies (GitHub API, file system, etc.)
- Export helper functions from `src/index.js` to make them individually testable

## Build and Release

### Build Process

- Use `npm run package` to bundle with ncc into `dist/`
- The `dist/` directory is not committed to the main branch — it is built by CI and published for Git tags (for example, release tags like `v1.2.3` or major-version tags like `v1`) by the publish workflow
- Users consume the action via version tags: `uses: owner/action@v1`

### Dependencies

- Prefer `@actions/*` packages for GitHub Actions functionality
- Use `@octokit/rest` for REST API calls and `@actions/github` for context and helpers
- Test that ncc bundling still works after adding dependencies
- Use semantic versioning: patch for bug fixes, minor for new features, major for breaking changes

## Code Style

- Follow the existing ESLint configuration in `eslint.config.js`
- Use ES modules (`import`/`export`) consistently
- Code is automatically formatted with Prettier — run `npm run format:write` to format
- Use single quotes for strings - when a string contains embedded single quotes (e.g., `Invalid 'days' input`), use a template literal instead of escaped quotes or double quotes (do not modify ESLint or Prettier config to resolve quote conflicts)
- Use JSDoc comments with parameter types and return types for exported functions
- Organize imports: `@actions/*` first, then `@octokit/*`, then other dependencies, then local imports
