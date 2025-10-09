# Contributing to Bulk GitHub Repository Settings Action

## Development Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Make your changes to `src/index.js`
4. Run tests: `npm test`
5. Build the action: `npm run package`

## Available Scripts

- `npm test` - Run Jest tests
- `npm run lint` - Run ESLint
- `npm run format:write` - Format code with Prettier
- `npm run package` - Bundle the action with ncc
- `npm run all` - Run format, lint, test, coverage, and package

## Testing Locally

You can test the action locally by setting environment variables:

```bash
export INPUT_GITHUB_TOKEN="ghp_your_token_here"
export INPUT_REPOSITORIES="owner/repo1,owner/repo2"
export INPUT_ALLOW_SQUASH_MERGE="true"
export INPUT_DELETE_BRANCH_ON_MERGE="true"
export INPUT_ENABLE_CODE_SCANNING="true"
node src/index.js
```

## Code Quality Standards

Follow the existing ESLint configuration and Prettier formatting. The project uses ES modules consistently and includes comprehensive Jest tests.

## Pull Requests

Please ensure all tests pass and code is properly formatted before submitting a pull request.
