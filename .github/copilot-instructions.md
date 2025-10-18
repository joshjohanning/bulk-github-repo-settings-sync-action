# GitHub Copilot Instructions for Node.js Actions

## Project Overview

This is a Node.js GitHub Action template with ESLint, Prettier, Jest testing, and ncc bundling. Follow these guidelines when making changes.

## Code Quality Standards

### ESLint Configuration

- Follow the existing ESLint configuration in `eslint.config.js`
- Use ES modules (`import`/`export`) consistently
- Prefer `const` over `let` when variables don't change
- Use descriptive variable names and JSDoc comments for functions
- Handle errors gracefully with try/catch blocks

### Prettier Formatting

- Code is automatically formatted with Prettier
- Run `npm run format:write` to format all files
- Use single quotes for strings unless they contain single quotes
- Line length limit is enforced by Prettier config

### Import Organization

```javascript
// Always follow this import order:
import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
// ... other imports
```

## Testing Guidelines

### Jest Test Structure

- Use ES modules with `jest.unstable_mockModule()` for mocking
- Mock `@actions/core`, `@actions/github`, and external APIs
- Test both success and error scenarios
- Use descriptive test names that explain the behavior

### Mock Patterns

```javascript
// Always mock modules before importing
jest.unstable_mockModule('@actions/core', () => mockCore);
const { functionToTest } = await import('../src/index.js');
```

### Test Coverage

- Write unit tests for all exported functions
- Test error handling paths
- Mock external dependencies (GitHub API, file system, etc.)
- Aim for meaningful assertions, not just code coverage

## GitHub Actions Patterns

### Input Handling

- Use our custom `getInput()` function for reliable local/CI compatibility
- Validate inputs early in the function
- Provide sensible defaults where appropriate
- Log input values for debugging (except sensitive data)

### Output Setting

- Always set outputs using `core.setOutput()`
- Use descriptive output names that match `action.yml`
- Include outputs in job summaries when available

### Error Handling

- Use `core.setFailed()` for action failures
- Use `core.warning()` for non-fatal issues
- Catch and handle API errors gracefully
- Provide helpful error messages

### Local Development Support

- Support running locally with environment variables
- Handle missing GitHub Actions environment gracefully
- Provide clear documentation for local testing

## File Organization

### Source Structure

- Main logic in `src/index.js`
- Export functions for testing
- Keep functions focused and single-purpose
- Use JSDoc comments for all exported functions

### Build Process

- Use `npm run package` to bundle with ncc
- Don't commit the bundled `dist/` directory (during publishing this gets published to **tag-only**)
- Run `npm run all` before committing (format, lint, test, package)

## Documentation Standards

### README Updates

- Keep usage examples up to date with `action.yml`
- Document all inputs and outputs
- Include local development instructions
- Update feature lists when adding functionality

### Code Comments

- Use JSDoc for function documentation
- Include parameter types and return types
- Add inline comments for complex logic
- Document environment variable requirements

## Dependencies

### Adding New Dependencies

- Prefer `@actions/*` packages for GitHub Actions functionality
- Keep dependencies minimal and well-maintained
- Update both `dependencies` and `devDependencies` appropriately
- Test that bundling still works after adding dependencies

### Version Management

- **Always increment the package.json version for each change**
- Use semantic versioning (major.minor.patch)
- Increment patch for bug fixes, minor for new features, major for breaking changes
- Update version before creating releases or publishing changes

### GitHub API Usage

- Use `@octokit/rest` for REST API calls
- Use `@actions/github` for context and helpers
- Handle rate limiting and authentication errors
- Cache API responses when appropriate
- Use pagination when necessary

### GitHub Instance Support

- **Always support GitHub.com, GHES, and GHEC-DR** using `github-api-url` input with default `${{ github.api_url }}`
- Initialize Octokit with a fallback `baseUrl`: `new Octokit({ auth: token, baseUrl: apiUrl || 'https://api.github.com' })`
- GHES/GHE documentation doesn't typically need to be called out separately in the README unless there are specific differences to highlight

## Performance Considerations

- Avoid unnecessary API calls (respect rate limits)
- Use efficient data structures for large datasets
- Handle large datasets with pagination and streaming when possible
- Cache API responses when appropriate to reduce redundant calls

## Security Best Practices

- Never log sensitive data (tokens, secrets)
- Use `core.setSecret()` to mask sensitive values
- Validate and sanitize user inputs
- Follow principle of least privilege for token permissions
- Document when using a GitHub App would be more appropriate than `github.token` or a PAT
