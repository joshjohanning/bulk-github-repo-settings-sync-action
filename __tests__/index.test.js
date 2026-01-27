/**
 * Tests for the Bulk GitHub Repository Settings Action
 */

import { jest } from '@jest/globals';

// Mock the @actions/core module
const mockCore = {
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setSecret: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addRaw: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined)
  }
};

// Mock the @actions/github module
const mockGithub = {
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' }
  }
};

// Mock octokit instance
const mockOctokit = {
  rest: {
    repos: {
      get: jest.fn(),
      update: jest.fn(),
      listForUser: jest.fn(),
      listForOrg: jest.fn(),
      replaceAllTopics: jest.fn(),
      getAllTopics: jest.fn(),
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
      getRepoRulesets: jest.fn(),
      getRepoRuleset: jest.fn(),
      createRepoRuleset: jest.fn(),
      updateRepoRuleset: jest.fn(),
      deleteRepoRuleset: jest.fn(),
      listAutolinks: jest.fn(),
      createAutolink: jest.fn(),
      deleteAutolink: jest.fn()
    },
    codeScanning: {
      updateDefaultSetup: jest.fn(),
      getDefaultSetup: jest.fn()
    },
    orgs: {
      get: jest.fn()
    },
    git: {
      getRef: jest.fn(),
      createRef: jest.fn(),
      updateRef: jest.fn()
    },
    pulls: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  },
  request: jest.fn()
};

// Mock fs module - use a real implementation that tracks test content
const mockFs = {
  readFileSync: jest.fn()
};

// Mock yaml module - use a real implementation that tracks test content
const mockYaml = {
  load: jest.fn()
};

// Action.yml content for mocking - this represents the inputs that should be considered valid
const mockActionYmlContent = `
name: 'Bulk GitHub Repository Settings Sync'
inputs:
  github-token:
    description: 'GitHub token'
  github-api-url:
    description: 'GitHub API URL'
  repositories:
    description: 'Repositories'
  repositories-file:
    description: 'Repositories file'
  owner:
    description: 'Owner'
  allow-squash-merge:
    description: 'Allow squash merge'
  allow-merge-commit:
    description: 'Allow merge commit'
  allow-rebase-merge:
    description: 'Allow rebase merge'
  allow-auto-merge:
    description: 'Allow auto merge'
  delete-branch-on-merge:
    description: 'Delete branch on merge'
  allow-update-branch:
    description: 'Allow update branch'
  immutable-releases:
    description: 'Immutable releases'
  code-scanning:
    description: 'Code scanning'
  enable-default-code-scanning:
    description: 'Enable default code scanning (deprecated)'
  secret-scanning:
    description: 'Secret scanning'
  secret-scanning-push-protection:
    description: 'Secret scanning push protection'
  dependabot-alerts:
    description: 'Dependabot alerts'
  dependabot-security-updates:
    description: 'Dependabot security updates'
  topics:
    description: 'Topics'
  dependabot-yml:
    description: 'Dependabot yml'
  dependabot-pr-title:
    description: 'Dependabot PR title'
  gitignore:
    description: 'Gitignore'
  gitignore-pr-title:
    description: 'Gitignore PR title'
  rulesets-file:
    description: 'Rulesets file'
  delete-unmanaged-rulesets:
    description: 'Delete unmanaged rulesets'
  pull-request-template:
    description: 'Pull request template'
  pull-request-template-pr-title:
    description: 'Pull request template PR title'
  workflow-files:
    description: 'Workflow files'
  workflow-files-pr-title:
    description: 'Workflow files PR title'
  autolinks-file:
    description: 'Autolinks file'
  copilot-instructions-md:
    description: 'Copilot instructions md'
  copilot-instructions-pr-title:
    description: 'Copilot instructions PR title'
  package-json-file:
    description: 'Package json file'
  package-json-sync-scripts:
    description: 'Sync scripts'
  package-json-sync-engines:
    description: 'Sync engines'
  package-json-pr-title:
    description: 'Package json PR title'
  dry-run:
    description: 'Dry run'
`;

const mockActionYmlParsed = {
  name: 'Bulk GitHub Repository Settings Sync',
  inputs: {
    'github-token': { description: 'GitHub token' },
    'github-api-url': { description: 'GitHub API URL' },
    repositories: { description: 'Repositories' },
    'repositories-file': { description: 'Repositories file' },
    owner: { description: 'Owner' },
    'allow-squash-merge': { description: 'Allow squash merge' },
    'allow-merge-commit': { description: 'Allow merge commit' },
    'allow-rebase-merge': { description: 'Allow rebase merge' },
    'allow-auto-merge': { description: 'Allow auto merge' },
    'delete-branch-on-merge': { description: 'Delete branch on merge' },
    'allow-update-branch': { description: 'Allow update branch' },
    'immutable-releases': { description: 'Immutable releases' },
    'code-scanning': { description: 'Code scanning' },
    'enable-default-code-scanning': { description: 'Enable default code scanning (deprecated)' },
    'secret-scanning': { description: 'Secret scanning' },
    'secret-scanning-push-protection': { description: 'Secret scanning push protection' },
    'dependabot-alerts': { description: 'Dependabot alerts' },
    'dependabot-security-updates': { description: 'Dependabot security updates' },
    topics: { description: 'Topics' },
    'dependabot-yml': { description: 'Dependabot yml' },
    'dependabot-pr-title': { description: 'Dependabot PR title' },
    gitignore: { description: 'Gitignore' },
    'gitignore-pr-title': { description: 'Gitignore PR title' },
    'rulesets-file': { description: 'Rulesets file' },
    'delete-unmanaged-rulesets': { description: 'Delete unmanaged rulesets' },
    'pull-request-template': { description: 'Pull request template' },
    'pull-request-template-pr-title': { description: 'Pull request template PR title' },
    'workflow-files': { description: 'Workflow files' },
    'workflow-files-pr-title': { description: 'Workflow files PR title' },
    'autolinks-file': { description: 'Autolinks file' },
    'copilot-instructions-md': { description: 'Copilot instructions md' },
    'copilot-instructions-pr-title': { description: 'Copilot instructions PR title' },
    'package-json-file': { description: 'Package json file' },
    'package-json-sync-scripts': { description: 'Sync scripts' },
    'package-json-sync-engines': { description: 'Sync engines' },
    'package-json-pr-title': { description: 'Package json PR title' },
    'dry-run': { description: 'Dry run' }
  }
};

// Track test-specific mock content
let testMockFiles = {};
let testMockYamlResults = {};

// Setup default mock implementations for fs and yaml that handle action.yml
function setupDefaultMocks() {
  // Reset test-specific content
  testMockFiles = {};
  testMockYamlResults = {};

  // Default fs.readFileSync that handles action.yml and test files
  mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
    if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
      return mockActionYmlContent;
    }
    // Check if there's test-specific content for this path
    if (testMockFiles[filePath]) {
      return testMockFiles[filePath];
    }
    // Return the default test content if set
    if (testMockFiles['__default__']) {
      return testMockFiles['__default__'];
    }
    return '';
  });

  // Default yaml.load that handles action.yml parsed content and test content
  mockYaml.load.mockImplementation(content => {
    if (content === mockActionYmlContent) {
      return mockActionYmlParsed;
    }
    // Check if there's test-specific parsed result for this content
    if (testMockYamlResults[content]) {
      return testMockYamlResults[content];
    }
    // Return the default test yaml if set
    if (testMockYamlResults['__default__']) {
      return testMockYamlResults['__default__'];
    }
    return {};
  });
}

// Helper functions for tests to set mock content without breaking action.yml handling
function setMockFileContent(content, filePath = '__default__') {
  testMockFiles[filePath] = content;
}

function setMockYamlContent(result, forContent = '__default__') {
  testMockYamlResults[forContent] = result;
}

// Mock the modules before importing the main module
jest.unstable_mockModule('@actions/core', () => mockCore);
jest.unstable_mockModule('@actions/github', () => mockGithub);
jest.unstable_mockModule('@octokit/rest', () => ({
  Octokit: jest.fn(() => mockOctokit)
}));
jest.unstable_mockModule('fs', () => mockFs);
jest.unstable_mockModule('js-yaml', () => mockYaml);

// Setup default mocks before importing (for action.yml reading during module load)
setupDefaultMocks();

// Import the main module and helper functions after mocking
const {
  default: run,
  parseRepositories,
  updateRepositorySettings,
  syncDependabotYml,
  syncGitignore,
  syncRepositoryRuleset,
  syncPullRequestTemplate,
  syncWorkflowFiles,
  syncAutolinks,
  syncCopilotInstructions,
  syncPackageJson,
  resetKnownRepoConfigKeysCache
} = await import('../src/index.js');

describe('Bulk GitHub Repository Settings Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the known repo config keys cache for test isolation
    resetKnownRepoConfigKeysCache();

    // Re-setup default mocks after clearing (needed for action.yml reading)
    setupDefaultMocks();

    // Reset Octokit mock
    mockOctokit.rest.repos.update.mockClear();
    mockOctokit.rest.repos.listForUser.mockClear();
    mockOctokit.rest.repos.listForOrg.mockClear();
    mockOctokit.rest.repos.replaceAllTopics.mockClear();
    mockOctokit.rest.repos.getContent.mockClear();
    mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
    mockOctokit.rest.repos.getRepoRulesets.mockClear();
    mockOctokit.rest.repos.getRepoRuleset.mockClear();
    mockOctokit.rest.repos.createRepoRuleset.mockClear();
    mockOctokit.rest.repos.updateRepoRuleset.mockClear();
    mockOctokit.rest.repos.listAutolinks.mockClear();
    mockOctokit.rest.repos.createAutolink.mockClear();
    mockOctokit.rest.repos.deleteAutolink.mockClear();
    mockOctokit.rest.codeScanning.updateDefaultSetup.mockClear();
    mockOctokit.rest.orgs.get.mockClear();
    mockOctokit.rest.git.getRef.mockClear();
    mockOctokit.rest.git.createRef.mockClear();
    mockOctokit.rest.git.updateRef.mockClear();
    mockOctokit.rest.pulls.list.mockClear();
    mockOctokit.rest.pulls.create.mockClear();
    mockOctokit.rest.pulls.update.mockClear();
    mockOctokit.request.mockClear();

    // Set default inputs
    mockCore.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'test-token',
        'github-api-url': '',
        repositories: '',
        'repositories-file': '',
        owner: '',
        'allow-squash-merge': '',
        'allow-merge-commit': '',
        'allow-rebase-merge': '',
        'allow-auto-merge': '',
        'delete-branch-on-merge': '',
        'allow-update-branch': '',
        'code-scanning': '',
        'immutable-releases': '',
        topics: '',
        'dependabot-yml': '',
        'dependabot-pr-title': '',
        'rulesets-file': '',
        'dry-run': ''
      };
      return inputs[name] || '';
    });
  });

  describe('parseRepositories', () => {
    test('should parse comma-separated repository list', async () => {
      const result = await parseRepositories('owner/repo1,owner/repo2', '', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
    });

    test('should parse repository list from YAML with repos array', async () => {
      setMockFileContent('repos:\n  - repo: owner/repo1\n  - repo: owner/repo2');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
    });

    test('should parse repository list with settings overrides', async () => {
      setMockFileContent('repos:\n  - repo: owner/repo1\n    allow-squash-merge: false\n  - repo: owner/repo2');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'allow-squash-merge': false }, { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1', 'allow-squash-merge': false }, { repo: 'owner/repo2' }]);
    });

    test('should handle mixed string and object format in repos array', async () => {
      setMockFileContent('repos:\n  - owner/repo1\n  - repo: owner/repo2');
      setMockYamlContent({
        repos: ['owner/repo1', { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
    });

    test('should warn about unknown configuration keys in repo config', async () => {
      setMockFileContent('repos:\n  - repo: owner/repo1\n    unknown-setting: true');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'unknown-setting': true, gitignor: 'path/to/file' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1', 'unknown-setting': true, gitignor: 'path/to/file' }]);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Unknown configuration key "unknown-setting"')
      );
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Unknown configuration key "gitignor"'));
    });

    test('should not warn about known configuration keys in repo config', async () => {
      setMockFileContent('repos:\n  - repo: owner/repo1\n    allow-squash-merge: false');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'allow-squash-merge': false, gitignore: 'path/to/file' }]
      });

      mockCore.warning.mockClear();
      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1', 'allow-squash-merge': false, gitignore: 'path/to/file' }]);
      // Should not have any warnings about unknown keys
      expect(mockCore.warning).not.toHaveBeenCalledWith(expect.stringContaining('Unknown configuration key'));
    });

    test('should reject YAML file without repos array', async () => {
      setMockFileContent('repositories:\n  - owner/repo1');
      setMockYamlContent({
        repositories: ['owner/repo1']
      });

      await expect(parseRepositories('', 'repos.yml', '', mockOctokit)).rejects.toThrow(
        'YAML file must contain a "repos" array'
      );
    });

    test('should fetch all repositories for owner', async () => {
      mockOctokit.rest.orgs.get.mockRejectedValue(new Error('Not an org'));
      mockOctokit.rest.repos.listForUser.mockResolvedValueOnce({
        data: [{ full_name: 'owner/repo1' }, { full_name: 'owner/repo2' }]
      });
      mockOctokit.rest.repos.listForUser.mockResolvedValueOnce({
        data: []
      });

      const result = await parseRepositories('all', '', 'owner', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
      expect(mockOctokit.rest.repos.listForUser).toHaveBeenCalled();
    });

    test('should fetch all repositories for organization', async () => {
      mockOctokit.rest.orgs.get.mockResolvedValue({ data: { login: 'my-org' } });
      mockOctokit.rest.repos.listForOrg.mockResolvedValueOnce({
        data: [{ full_name: 'my-org/repo1' }, { full_name: 'my-org/repo2' }]
      });
      mockOctokit.rest.repos.listForOrg.mockResolvedValueOnce({
        data: []
      });

      const result = await parseRepositories('all', '', 'my-org', mockOctokit);
      expect(result).toEqual([{ repo: 'my-org/repo1' }, { repo: 'my-org/repo2' }]);
      expect(mockOctokit.rest.repos.listForOrg).toHaveBeenCalled();
    });

    test('should throw error when using "all" without owner', async () => {
      await expect(parseRepositories('all', '', '', mockOctokit)).rejects.toThrow(
        'Owner must be specified when using "all" for repositories'
      );
    });

    test('should throw error when no repositories specified', async () => {
      await expect(parseRepositories('', '', '', mockOctokit)).rejects.toThrow('No repositories specified');
    });
  });

  describe('updateRepositorySettings', () => {
    test('should update repository settings successfully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          allow_merge_commit: true,
          allow_rebase_merge: false,
          allow_auto_merge: false,
          delete_branch_on_merge: false,
          allow_update_branch: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = {
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: true,
        allow_auto_merge: true,
        delete_branch_on_merge: true,
        allow_update_branch: true
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.repository).toBe('owner/repo');
      expect(result.changes.length).toBe(6);
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: true,
        allow_auto_merge: true,
        delete_branch_on_merge: true,
        allow_update_branch: true
      });
    });

    test('should enable CodeQL scanning when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.getDefaultSetup.mockRejectedValue(new Error('Not found'));
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, null, null, false);

      expect(result.success).toBe(true);
      expect(result.codeScanningEnabled).toBe(true);
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'configured',
        query_suite: 'default'
      });
    });

    test('should handle CodeQL setup failures gracefully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.getDefaultSetup.mockRejectedValue(new Error('Not found'));
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockRejectedValue(new Error('Language not supported'));

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, null, null, false);

      expect(result.success).toBe(true);
      expect(result.codeScanningWarning).toContain('Could not process CodeQL');
      expect(result.codeScanningWarning).toContain('Language not supported');
    });

    test('should update topics when provided', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.repos.getAllTopics.mockResolvedValue({
        data: { names: ['old-topic'] }
      });
      mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const topics = ['javascript', 'github-actions', 'automation'];

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        topics,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.topicsUpdated).toBe(true);
      expect(result.topicsChange).toBeDefined();
      expect(result.topicsChange.from).toEqual(['old-topic']);
      expect(result.topicsChange.to).toEqual(topics);
      expect(result.topicsChange.added).toEqual(['javascript', 'github-actions', 'automation']);
      expect(result.topicsChange.removed).toEqual(['old-topic']);
      expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        names: topics
      });
    });

    test('should handle topics update failures gracefully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.repos.getAllTopics.mockRejectedValue(new Error('Topics fetch failed'));

      const settings = { allow_squash_merge: true };
      const topics = ['test'];

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        topics,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.topicsWarning).toContain('Could not process topics');
    });

    test('should not update topics when null', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(mockOctokit.rest.repos.getAllTopics).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.replaceAllTopics).not.toHaveBeenCalled();
    });

    test('should enable immutable releases when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return 404 (not enabled)
      mockOctokit.request.mockRejectedValueOnce({ status: 404 });
      // Mock PUT to enable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        true,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.immutableReleasesUpdated).toBe(true);
      expect(result.immutableReleasesChange).toBeDefined();
      expect(result.immutableReleasesChange.from).toBe(false);
      expect(result.immutableReleasesChange.to).toBe(true);
      expect(mockOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/immutable-releases', {
        owner: 'owner',
        repo: 'repo',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      expect(mockOctokit.request).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/immutable-releases', {
        owner: 'owner',
        repo: 'repo',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    });

    test('should disable immutable releases when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return success with enabled: true
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: true, enforced_by_owner: false } });
      // Mock DELETE to disable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        false,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.immutableReleasesUpdated).toBe(true);
      expect(result.immutableReleasesChange).toBeDefined();
      expect(result.immutableReleasesChange.from).toBe(true);
      expect(result.immutableReleasesChange.to).toBe(false);
      expect(mockOctokit.request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/immutable-releases', {
        owner: 'owner',
        repo: 'repo',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    });

    test('should handle immutable releases already in desired state', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return success with enabled: true (already enabled)
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: true, enforced_by_owner: false } });

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        true,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.immutableReleasesUnchanged).toBe(true);
      expect(result.currentImmutableReleases).toBe(true);
      // Should only call GET, not PUT
      expect(mockOctokit.request).toHaveBeenCalledTimes(1);
    });

    test('should handle immutable releases failures gracefully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.request.mockRejectedValue(new Error('Insufficient permissions'));

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        true,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.immutableReleasesWarning).toContain('Could not process immutable releases');
      expect(result.immutableReleasesWarning).toContain('Insufficient permissions');
    });

    test('should handle immutable releases when API returns enabled: false', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return success with enabled: false (not enabled)
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: false, enforced_by_owner: false } });
      // Mock PUT to enable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        true,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.currentImmutableReleases).toBe(false);
      expect(result.immutableReleasesUpdated).toBe(true);
      expect(result.immutableReleasesChange).toBeDefined();
      expect(result.immutableReleasesChange.from).toBe(false);
      expect(result.immutableReleasesChange.to).toBe(true);
    });

    test('should not check immutable releases when null', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      // request should not be called at all when immutableReleases is null
      expect(mockOctokit.request).not.toHaveBeenCalled();
    });

    test('should enable secret scanning when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'disabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: true,
        secretScanningPushProtection: null,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningUpdated).toBe(true);
      expect(result.secretScanningChange).toBeDefined();
      expect(result.secretScanningChange.from).toBe(false);
      expect(result.secretScanningChange.to).toBe(true);
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          security_and_analysis: {
            secret_scanning: { status: 'enabled' }
          }
        })
      );
    });

    test('should handle secret scanning already enabled', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'enabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: true,
        secretScanningPushProtection: null,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningUnchanged).toBe(true);
      expect(result.currentSecretScanning).toBe(true);
    });

    test('should handle secret scanning failures gracefully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'disabled' }
          }
        }
      });
      mockOctokit.rest.repos.update
        .mockResolvedValueOnce({}) // First call for settings
        .mockRejectedValueOnce(new Error('Secret scanning not available')); // Second call for security

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: true,
        secretScanningPushProtection: null,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningWarning).toContain('Could not process secret scanning');
    });

    test('should enable secret scanning push protection when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'enabled' },
            secret_scanning_push_protection: { status: 'disabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: true,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningPushProtectionUpdated).toBe(true);
      expect(result.secretScanningPushProtectionChange).toBeDefined();
      expect(result.secretScanningPushProtectionChange.from).toBe(false);
      expect(result.secretScanningPushProtectionChange.to).toBe(true);
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          security_and_analysis: {
            secret_scanning_push_protection: { status: 'enabled' }
          }
        })
      );
    });

    test('should handle secret scanning push protection already enabled', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'enabled' },
            secret_scanning_push_protection: { status: 'enabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: true,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningPushProtectionUnchanged).toBe(true);
      expect(result.currentSecretScanningPushProtection).toBe(true);
    });

    test('should disable secret scanning push protection when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'enabled' },
            secret_scanning_push_protection: { status: 'enabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: false,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.secretScanningPushProtectionUpdated).toBe(true);
      expect(result.secretScanningPushProtectionChange).toBeDefined();
      expect(result.secretScanningPushProtectionChange.from).toBe(true);
      expect(result.secretScanningPushProtectionChange.to).toBe(false);
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          security_and_analysis: {
            secret_scanning_push_protection: { status: 'disabled' }
          }
        })
      );
    });

    test('should enable Dependabot alerts when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return 404 (disabled)
      mockOctokit.request.mockRejectedValueOnce({ status: 404 });
      // Mock PUT to enable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: null,
        dependabotAlerts: true,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotAlertsUpdated).toBe(true);
      expect(result.dependabotAlertsChange).toBeDefined();
      expect(result.dependabotAlertsChange.from).toBe(false);
      expect(result.dependabotAlertsChange.to).toBe(true);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'PUT /repos/{owner}/{repo}/vulnerability-alerts',
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo'
        })
      );
    });

    test('should disable Dependabot alerts when requested', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return 204 (enabled)
      mockOctokit.request.mockResolvedValueOnce({});
      // Mock DELETE to disable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: null,
        dependabotAlerts: false,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotAlertsUpdated).toBe(true);
      expect(result.dependabotAlertsChange.from).toBe(true);
      expect(result.dependabotAlertsChange.to).toBe(false);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'DELETE /repos/{owner}/{repo}/vulnerability-alerts',
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo'
        })
      );
    });

    test('should handle Dependabot alerts already in desired state', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return 204 (enabled)
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: null,
        dependabotAlerts: true,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotAlertsUnchanged).toBe(true);
      expect(result.currentDependabotAlerts).toBe(true);
    });

    test('should handle Dependabot security updates enable', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET to return disabled
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: false } });
      // Mock PUT to enable
      mockOctokit.request.mockResolvedValueOnce({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: null,
        dependabotAlerts: null,
        dependabotSecurityUpdates: true
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotSecurityUpdatesUpdated).toBe(true);
      expect(result.dependabotSecurityUpdatesChange).toBeDefined();
      expect(result.dependabotSecurityUpdatesChange.from).toBe(false);
      expect(result.dependabotSecurityUpdatesChange.to).toBe(true);
    });

    test('should handle security settings in dry-run mode', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true },
          security_and_analysis: {
            secret_scanning: { status: 'disabled' }
          }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});
      // Mock GET for Dependabot alerts to return 404 (disabled)
      mockOctokit.request.mockRejectedValueOnce({ status: 404 });
      // Mock GET for Dependabot security updates to return disabled
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: false } });

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: true,
        secretScanningPushProtection: null,
        dependabotAlerts: true,
        dependabotSecurityUpdates: true
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.secretScanningWouldUpdate).toBe(true);
      expect(result.dependabotAlertsWouldUpdate).toBe(true);
      expect(result.dependabotSecurityUpdatesWouldUpdate).toBe(true);
      // Should not call PUT/DELETE in dry-run mode (only GETs for checking status)
      expect(mockOctokit.request).not.toHaveBeenCalledWith(
        'PUT /repos/{owner}/{repo}/vulnerability-alerts',
        expect.anything()
      );
    });

    test('should not check security settings when all are null', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = { allow_squash_merge: true };
      const securitySettings = {
        secretScanning: null,
        secretScanningPushProtection: null,
        dependabotAlerts: null,
        dependabotSecurityUpdates: null
      };

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        securitySettings,
        false
      );

      expect(result.success).toBe(true);
      // Should not call request for security settings when all are null
      expect(mockOctokit.request).not.toHaveBeenCalled();
    });

    test('should only update specified settings', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          permissions: { admin: true, push: true, pull: true },
          allow_squash_merge: false,
          allow_merge_commit: null,
          allow_rebase_merge: null,
          allow_auto_merge: null,
          delete_branch_on_merge: false,
          allow_update_branch: null
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      const settings = {
        allow_squash_merge: true,
        allow_merge_commit: null,
        allow_rebase_merge: null,
        allow_auto_merge: null,
        delete_branch_on_merge: true,
        allow_update_branch: null
      };

      await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, null, false);

      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        allow_squash_merge: true,
        delete_branch_on_merge: true
      });
    });

    test('should handle invalid repository format', async () => {
      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(
        mockOctokit,
        'invalid-repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid repository format. Expected "owner/repo"');
    });

    test('should handle API errors', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API Error'));

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    test('should handle 403 access denied errors with warning', async () => {
      const error403 = new Error('Forbidden');
      error403.status = 403;
      mockOctokit.rest.repos.get.mockRejectedValue(error403);

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(false);
      expect(result.accessDenied).toBe(true);
      expect(result.error).toContain('Access denied');
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Access denied to repository owner/repo'));
    });

    test('should handle insufficient permissions when permissions object is missing', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'owner/repo',
          // No permissions object at all
          allow_squash_merge: true
        }
      });

      const settings = { allow_squash_merge: false };
      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(false);
      expect(result.insufficientPermissions).toBe(true);
      expect(result.error).toContain('does not have any access');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient permissions for repository owner/repo')
      );
    });

    test('should handle when app is not installed on repository', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'owner/repo',
          permissions: {
            admin: false,
            maintain: false,
            push: false,
            triage: false,
            pull: false
          }
          // Missing allow_squash_merge may indicate app not installed, insufficient permissions, or API changes
        }
      });

      const settings = { allow_squash_merge: false };
      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(false);
      expect(result.insufficientPermissions).toBe(true);
      expect(result.error).toContain('Cannot read repository settings');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('GitHub App may not be installed on this repository')
      );
    });

    test('should allow updates without admin permissions when app has proper permissions', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'owner/repo',
          allow_squash_merge: true, // Has the settings (app has permissions)
          permissions: {
            admin: false, // No admin permission (expected for GitHub Apps)
            push: true,
            pull: true
          }
        }
      });

      const settings = { allow_squash_merge: false };
      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        false,
        null,
        null,
        null,
        false
      );

      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(mockOctokit.rest.repos.update).toHaveBeenCalled();
    });

    test('should allow dry-run mode without admin permissions', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'owner/repo',
          allow_squash_merge: false, // Has settings (app is installed)
          permissions: {
            admin: false, // No admin permission
            push: true,
            pull: true
          }
        }
      });

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, null, true); // dry-run

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.changes.length).toBe(1); // Should show what would change
      expect(mockOctokit.rest.repos.update).not.toHaveBeenCalled();
    });

    test('should not make update API calls in dry-run mode', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          allow_squash_merge: false,
          permissions: { admin: true, push: true, pull: true }
        }
      });
      mockOctokit.rest.repos.getAllTopics.mockResolvedValue({
        data: { names: [] }
      });
      mockOctokit.rest.codeScanning.getDefaultSetup.mockRejectedValue(new Error('Not found'));
      // Mock immutable releases GET request (404 = not enabled)
      mockOctokit.request.mockImplementation(method => {
        if (method.includes('GET /repos/{owner}/{repo}/immutable-releases')) {
          const error = new Error('Not Found');
          error.status = 404;
          return Promise.reject(error);
        }
        return Promise.reject(new Error('Unexpected request'));
      });

      const settings = { allow_squash_merge: true };
      const topics = ['javascript', 'test'];

      const result = await updateRepositorySettings(
        mockOctokit,
        'owner/repo',
        settings,
        true,
        true,
        topics,
        null,
        true
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.topicsWouldUpdate).toBe(true);
      expect(result.codeScanningWouldEnable).toBe(true);
      expect(result.immutableReleasesWouldUpdate).toBe(true);
      expect(mockOctokit.rest.repos.get).toHaveBeenCalled(); // Should fetch current state
      expect(mockOctokit.rest.repos.update).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.replaceAllTopics).not.toHaveBeenCalled();
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).not.toHaveBeenCalled();
      // Verify immutable releases API was checked but not called for updates
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/immutable-releases',
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo'
        })
      );
      expect(mockOctokit.request).not.toHaveBeenCalledWith(
        'PUT /repos/{owner}/{repo}/immutable-releases',
        expect.any(Object)
      );
    });
  });

  describe('Action execution', () => {
    test('should process repositories successfully', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1,owner/repo2',
          'allow-squash-merge': 'true',
          'delete-branch-on-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '2');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledTimes(2);
    });

    test('should handle partial failures', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1,owner/repo2',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('API Error'));

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '1');
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to update'));
    });

    test('should fail when no token provided', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': '',
          repositories: 'owner/repo1'
        };
        return inputs[name] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: github-token is required');
    });

    test('should fail when no settings specified', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1'
        };
        return inputs[name] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Action failed with error: At least one repository setting must be specified (or code-scanning must be true, or immutable-releases must be specified, or security settings must be specified, or topics must be provided, or dependabot-yml must be specified, or gitignore must be specified, or rulesets-file must be specified, or pull-request-template must be specified, or workflow-files must be specified, or autolinks-file must be specified, or copilot-instructions-md must be specified, or package-json-file with package-json-sync-scripts or package-json-sync-engines must be specified)'
      );
    });

    test('should allow topics as the only setting', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          topics: 'javascript,github-actions,automation'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({});

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        names: ['javascript', 'github-actions', 'automation']
      });
    });

    test('should allow CodeQL scanning as the only setting', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        state: 'configured',
        query_suite: 'default'
      });
    });

    test('should allow code-scanning false as a valid setting (no API call made)', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'code-scanning': 'false'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      // code-scanning: false is a valid setting (doesn't fail with "no settings specified")
      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      // But the current implementation only supports enabling, so no API call is made
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).not.toHaveBeenCalled();
    });

    test('should show deprecation warning when using old enable-default-code-scanning input', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'enable-default-code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(
        'The "enable-default-code-scanning" input is deprecated. Please use "code-scanning" instead.'
      );
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        state: 'configured',
        query_suite: 'default'
      });
    });

    test('should show deprecation warning when both old and new code-scanning inputs are provided', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'code-scanning': 'false',
          'enable-default-code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      // Should warn about deprecated input
      expect(mockCore.warning).toHaveBeenCalledWith(
        'The "enable-default-code-scanning" input is deprecated. Please use "code-scanning" instead.'
      );
      // New input takes precedence (false means no action, only true enables)
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).not.toHaveBeenCalled();
    });

    test('should not show deprecation warning when only new code-scanning input is used', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      await run();

      // Should not warn about deprecated input
      expect(mockCore.warning).not.toHaveBeenCalledWith(
        'The "enable-default-code-scanning" input is deprecated. Please use "code-scanning" instead.'
      );
    });

    test('should allow immutable releases as the only setting', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'immutable-releases': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.request.mockRejectedValueOnce({ status: 404 }); // GET returns 404 (not enabled)
      mockOctokit.request.mockResolvedValueOnce({}); // PUT to enable

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      expect(mockOctokit.request).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/immutable-releases', {
        owner: 'owner',
        repo: 'repo1',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    });

    test('should create summary table', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      expect(mockCore.summary.addHeading).toHaveBeenCalledWith('Bulk Repository Settings Update Results');
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      expect(mockCore.summary.write).toHaveBeenCalled();
    });

    test('should include specific changes in summary table when settings change', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true',
          'delete-branch-on-merge': 'true'
        };
        return inputs[name] || '';
      });

      // Mock repo with different current settings to trigger changes
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: false, // Different from input
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false, // Different from input
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      // Verify the summary table was called with changes details
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      // Find the row for repo1 and check it has change details
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('settings:');
    });

    test('should include topics changes in summary table', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          topics: 'new-topic,another-topic'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getAllTopics.mockResolvedValue({
        data: { names: ['old-topic'] }
      });
      mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({});

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('topics:');
    });

    test('should include CodeQL scanning changes in summary table', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.codeScanning.getDefaultSetup.mockResolvedValue({
        data: { state: 'not-configured' }
      });
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('CodeQL');
    });

    test('should include immutable releases changes in summary table', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'immutable-releases': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      // Mock immutable releases as not enabled
      mockOctokit.request.mockRejectedValue({ status: 404 });
      mockOctokit.request.mockResolvedValueOnce({ data: { enabled: false } });
      mockOctokit.request.mockResolvedValueOnce({});

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('immutable releases');
    });

    test('should show dry-run specific messages in summary table', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true',
          'dry-run': 'true'
        };
        return inputs[name] || '';
      });

      // Mock repo with different current settings to trigger changes
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: false, // Different from input
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });

      await run();

      expect(mockCore.summary.addHeading).toHaveBeenCalledWith('Bulk Repository Settings Update Results (DRY-RUN)');
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('Would update');
    });

    test('should process repo-specific settings overrides from YAML', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'repositories-file': 'repos.yml',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      setMockFileContent('repos:\n  - repo: owner/repo1\n    allow-squash-merge: false');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'allow-squash-merge': false }, { repo: 'owner/repo2' }]
      });

      // repo1: current allow_squash_merge=true, want false -> update
      // repo2: current allow_squash_merge=false, want true (global) -> update
      mockOctokit.rest.repos.get
        .mockResolvedValueOnce({
          data: {
            default_branch: 'main',
            permissions: { admin: true },
            allow_squash_merge: true, // different from override (false)
            allow_merge_commit: true,
            allow_rebase_merge: true,
            delete_branch_on_merge: false,
            allow_auto_merge: false,
            allow_update_branch: false
          }
        })
        .mockResolvedValueOnce({
          data: {
            default_branch: 'main',
            permissions: { admin: true },
            allow_squash_merge: false, // different from global (true)
            allow_merge_commit: true,
            allow_rebase_merge: true,
            delete_branch_on_merge: false,
            allow_auto_merge: false,
            allow_update_branch: false
          }
        });
      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      // repo1 should use override (false), repo2 should use global (true)
      expect(mockOctokit.rest.repos.update).toHaveBeenCalledTimes(2);
      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '2');
    });

    test('should process repo-specific topics as string', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'repositories-file': 'repos.yml',
          topics: 'global-topic'
        };
        return inputs[name] || '';
      });

      setMockFileContent('repos:\n  - repo: owner/repo1\n    topics: repo-topic1,repo-topic2');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', topics: 'repo-topic1,repo-topic2' }]
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getAllTopics.mockResolvedValue({ data: { names: [] } });
      mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({});

      await run();

      expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        names: ['repo-topic1', 'repo-topic2']
      });
    });

    test('should process repo-specific topics as array', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'repositories-file': 'repos.yml',
          topics: 'global-topic'
        };
        return inputs[name] || '';
      });

      setMockFileContent('repos:\n  - repo: owner/repo1\n    topics:\n      - topic1\n      - topic2');
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', topics: ['topic1', 'topic2'] }]
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getAllTopics.mockResolvedValue({ data: { names: [] } });
      mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({});

      await run();

      expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        names: ['topic1', 'topic2']
      });
    });

    test('should process repo-specific workflow-files as string', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'repositories-file': 'repos.yml',
          'workflow-files': 'global.yml'
        };
        return inputs[name] || '';
      });

      mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
        if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
          return mockActionYmlContent;
        }
        if (filePath === 'repos.yml') {
          return 'repos:\n  - repo: owner/repo1\n    workflow-files: repo-workflow.yml';
        }
        return 'name: Test Workflow';
      });
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'workflow-files': 'repo-workflow.yml' }]
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 1, html_url: 'https://github.com/owner/repo1/pull/1' }
      });

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
    });

    test('should process repo-specific workflow-files as array', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'repositories-file': 'repos.yml',
          'workflow-files': 'global.yml'
        };
        return inputs[name] || '';
      });

      mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
        if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
          return mockActionYmlContent;
        }
        if (filePath === 'repos.yml') {
          return 'repos:\n  - repo: owner/repo1\n    workflow-files:\n      - file1.yml\n      - file2.yml';
        }
        return 'name: Test Workflow';
      });
      setMockYamlContent({
        repos: [{ repo: 'owner/repo1', 'workflow-files': ['file1.yml', 'file2.yml'] }]
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 1, html_url: 'https://github.com/owner/repo1/pull/1' }
      });

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
    });

    test('should handle summary table with dependabot sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'dependabot-yml': 'dependabot.yml'
        };
        return inputs[name] || '';
      });

      setMockFileContent('version: 2\nupdates: []');
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      // First call checks for existing branch (404), second call gets default branch SHA
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 42, html_url: 'https://github.com/owner/repo1/pull/42' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('dependabot.yml');
    });

    test('should handle summary table with gitignore sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          gitignore: '.gitignore'
        };
        return inputs[name] || '';
      });

      setMockFileContent('node_modules/\n.env');
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 43, html_url: 'https://github.com/owner/repo1/pull/43' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('.gitignore');
    });

    test('should handle summary table with ruleset sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'rulesets-file': 'ruleset.json'
        };
        return inputs[name] || '';
      });

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ name: 'test-ruleset', target: 'branch', enforcement: 'active', rules: [] })
      );
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createRepoRuleset.mockResolvedValue({ data: { id: 1 } });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('ruleset');
    });

    test('should handle summary table with workflow files sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'workflow-files': 'ci.yml'
        };
        return inputs[name] || '';
      });

      setMockFileContent('name: CI\non: push');
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 44, html_url: 'https://github.com/owner/repo1/pull/44' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('workflow');
    });

    test('should handle summary table with autolinks sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'autolinks-file': 'autolinks.json'
        };
        return inputs[name] || '';
      });

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ autolinks: [{ key_prefix: 'JIRA-', url_template: 'https://jira.example.com/browse/<num>' }] })
      );
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('autolinks');
    });

    test('should handle summary table with copilot instructions sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'copilot-instructions-md': 'copilot-instructions.md'
        };
        return inputs[name] || '';
      });

      setMockFileContent('# Copilot Instructions\n\nBe helpful.');
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 45, html_url: 'https://github.com/owner/repo1/pull/45' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('copilot-instructions');
    });

    test('should handle summary table with package.json sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'package-json-sync-scripts': 'true',
          'package-json-file': 'package.json'
        };
        return inputs[name] || '';
      });

      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          name: 'source-repo',
          scripts: { test: 'jest', build: 'tsc' }
        })
      );
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(
            JSON.stringify({
              name: 'target-repo',
              scripts: { test: 'mocha' }
            })
          ).toString('base64'),
          sha: 'target123'
        }
      });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 47, html_url: 'https://github.com/owner/repo1/pull/47' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('package.json');
    });

    test('should handle summary table with PR template sync changes', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'pull-request-template': 'pr-template.md'
        };
        return inputs[name] || '';
      });

      setMockFileContent('## Description\n\nPlease describe your changes.');
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });
      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 46, html_url: 'https://github.com/owner/repo1/pull/46' }
      });

      await run();

      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('PR template');
    });

    test('should use custom GitHub API URL when provided', async () => {
      const customApiUrl = 'https://ghes.example.com/api/v3';

      // Import Octokit mock to verify constructor was called with correct params
      const { Octokit } = await import('@octokit/rest');

      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'github-api-url': customApiUrl,
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      expect(Octokit).toHaveBeenCalledWith({
        auth: 'test-token',
        baseUrl: customApiUrl
      });
      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
    });

    test('should default to https://api.github.com when no API URL provided', async () => {
      const { Octokit } = await import('@octokit/rest');

      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'github-api-url': '',
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      expect(Octokit).toHaveBeenCalledWith({
        auth: 'test-token',
        baseUrl: 'https://api.github.com'
      });
      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
    });

    test('should work with GHEC-DR (GHE) URL', async () => {
      const gheUrl = 'https://api.octocorp.ghe.com';
      const { Octokit } = await import('@octokit/rest');

      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          'github-api-url': gheUrl,
          repositories: 'owner/repo1',
          'allow-squash-merge': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});

      await run();

      expect(Octokit).toHaveBeenCalledWith({
        auth: 'test-token',
        baseUrl: gheUrl
      });
      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
    });
  });

  describe('syncDependabotYml', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
      mockOctokit.rest.pulls.update.mockClear();
    });

    test('should create dependabot.yml when it does not exist', async () => {
      const testDependabotContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(testDependabotContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File does not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 }) // Branch check
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'abc123' } }
        });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42'
        }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: add dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('created');
      expect(result.prNumber).toBe(42);
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          path: '.github/dependabot.yml',
          branch: 'dependabot-yml-sync'
        })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update dependabot.yml when content differs', async () => {
      const newContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "daily"';
      const oldContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
        data: { object: { sha: 'abc123' } }
      });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 43,
          html_url: 'https://github.com/owner/repo/pull/43'
        }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'file-sha-456'
        })
      );
    });

    test('should not create PR when content is unchanged', async () => {
      const content =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with same content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(content).toString('base64')
        }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('unchanged');
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('should update existing branch when branch already exists', async () => {
      const newContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "daily"';
      const oldContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-777',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch already exists
      mockOctokit.rest.git.getRef
        .mockResolvedValueOnce({
          // Branch exists
          data: { object: { sha: 'branch-sha-123' } }
        })
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'main-sha-456' } }
        });

      mockOctokit.rest.git.updateRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 44,
          html_url: 'https://github.com/owner/repo/pull/44'
        }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('updated');
      expect(result.prNumber).toBe(44);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/dependabot-yml-sync',
        sha: 'main-sha-456',
        force: true
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update existing PR when content differs', async () => {
      const newContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "daily"';
      const oldContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // First call: check default branch (for initial comparison)
      // Second call: check PR branch (for PR update comparison)
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('Updated');
      expect(result.message).toContain('PR #50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'dependabot-yml-sync',
          sha: 'file-sha-pr-branch'
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const newContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "daily"';
      const oldContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // Default branch has old content, but PR branch already has the new content
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(newContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('PR #50 already has the latest');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should create file in PR branch when file does not exist in PR branch', async () => {
      const newContent = 'version: 2\nupdates:\n  - package-ecosystem: "npm"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // First call: file doesn't exist in default branch
      // Second call: file doesn't exist in PR branch either
      mockOctokit.rest.repos.getContent.mockRejectedValueOnce({ status: 404 }).mockRejectedValueOnce({ status: 404 });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: add dependabot.yml',
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('pr-updated-created');
      expect(result.prNumber).toBe(50);
      expect(result.message).toContain('Created');
      expect(result.message).toContain('PR #50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'dependabot-yml-sync',
          sha: undefined
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode with existing PR needing update', async () => {
      const newContent = 'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    schedule:\n      interval: "daily"';
      const oldContent = 'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    schedule:\n      interval: "weekly"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('would-update-pr');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.dryRun).toBe(true);
      expect(result.message).toContain('Would update');
      expect(result.message).toContain('PR #50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = 'version: 2\nupdates:\n  - package-ecosystem: "npm"';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PR
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: add dependabot.yml',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncDependabotYml(
        mockOctokit,
        'invalid-repo-format',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing dependabot.yml file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './nonexistent.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file at');
    });

    test('should handle API errors', async () => {
      setMockFileContent('version: 2');

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncDependabotYml(
        mockOctokit,
        'owner/repo',
        './dependabot.yml',
        'chore: update dependabot.yml',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync dependabot.yml');
    });
  });

  describe('syncRepositoryRuleset', () => {
    test('should create ruleset when it does not exist', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createRepoRuleset.mockResolvedValue({
        data: { id: 123, name: 'ci' }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('created');
      expect(result.rulesetId).toBe(123);
      expect(mockOctokit.rest.repos.getRepoRulesets).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo'
      });
      expect(mockOctokit.rest.repos.createRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ...rulesetConfig
      });
    });

    test('should update existing ruleset when content differs', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRuleset = {
        id: 456,
        name: 'ci',
        target: 'branch',
        enforcement: 'disabled', // Different from config
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 456, name: 'ci', enforcement: 'disabled' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });
      mockOctokit.rest.repos.updateRepoRuleset.mockResolvedValue({
        data: { id: 456, name: 'ci' }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('updated');
      expect(result.rulesetId).toBe(456);
      expect(mockOctokit.rest.repos.getRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ruleset_id: 456
      });
      expect(mockOctokit.rest.repos.updateRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ruleset_id: 456,
        ...rulesetConfig
      });
    });

    test('should not update ruleset when content is unchanged', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRuleset = {
        id: 789,
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }],
        // These fields are returned by API but should be ignored in comparison
        source_type: 'Repository',
        source: 'owner/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 789, name: 'ci' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.rulesetId).toBe(789);
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.repos.getRepoRuleset).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.updateRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
    });

    test('should not update ruleset when source config contains API-only fields', async () => {
      // Source config that looks like a raw API response export (has API-only fields)
      const rulesetConfig = {
        id: 9620349,
        name: 'ci',
        target: 'branch',
        source_type: 'Repository',
        source: 'some-owner/some-repo',
        enforcement: 'active',
        conditions: {
          ref_name: {
            exclude: [],
            include: ['~DEFAULT_BRANCH']
          }
        },
        rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
        node_id: 'RRS_lACqUmVwb3NpdG9yec4uPAeNzgCTID8',
        created_at: '2025-11-08T08:49:56.048-06:00',
        updated_at: '2025-11-08T08:49:56.128-06:00',
        bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
        current_user_can_bypass: 'always',
        _links: {
          self: { href: 'https://api.github.com/repos/some-owner/some-repo/rulesets/9620349' },
          html: { href: 'https://github.com/some-owner/some-repo/rules/9620349' }
        }
      };

      // Existing ruleset from API (matches the relevant fields)
      const existingRuleset = {
        id: 456,
        name: 'ci',
        target: 'branch',
        source_type: 'Repository',
        source: 'owner/repo',
        enforcement: 'active',
        conditions: {
          ref_name: {
            exclude: [],
            include: ['~DEFAULT_BRANCH']
          }
        },
        rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
        bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
        current_user_can_bypass: 'always'
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 456, name: 'ci' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.rulesetId).toBe(456);
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.repos.getRepoRuleset).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.updateRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for creation', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({ data: [] });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for update', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRuleset = {
        id: 456,
        name: 'ci',
        target: 'branch',
        enforcement: 'disabled', // Different from config
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 456, name: 'ci', enforcement: 'disabled' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.repos.getRepoRuleset).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.updateRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncRepositoryRuleset(mockOctokit, 'invalid-repo-format', './ruleset.json', false, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing ruleset file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './nonexistent.json', false, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse ruleset file');
    });

    test('should handle invalid JSON in ruleset file', async () => {
      setMockFileContent('{ invalid json }');

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './invalid.json', false, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse ruleset file');
    });

    test('should handle ruleset without name', async () => {
      const rulesetConfig = {
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ruleset configuration must include a "name" field');
    });

    test('should handle API errors', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync ruleset');
    });

    test('should handle 404 errors when rulesets are not enabled', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      setMockFileContent(JSON.stringify(rulesetConfig));
      const error404 = new Error('Not Found');
      error404.status = 404;
      mockOctokit.rest.repos.getRepoRulesets.mockRejectedValue(error404);
      mockOctokit.rest.repos.createRepoRuleset.mockResolvedValue({
        data: { id: 123, name: 'ci' }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('created');
    });

    test('should delete unmanaged rulesets when updating a ruleset', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }, { type: 'pull_request' }] // Different from existing
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'old-ruleset' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'deletion' }] // Different - triggers update
        }
      });
      mockOctokit.rest.repos.updateRepoRuleset.mockResolvedValue({});
      mockOctokit.rest.repos.deleteRepoRuleset.mockResolvedValue({});

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('updated');
      expect(result.deletedRulesets).toHaveLength(1);
      expect(result.deletedRulesets[0].name).toBe('old-ruleset');
      expect(result.deletedRulesets[0].deleted).toBe(true);
      expect(mockOctokit.rest.repos.updateRepoRuleset).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.repos.deleteRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ruleset_id: 456
      });
    });

    test('should delete unmanaged rulesets when creating a new ruleset', async () => {
      const rulesetConfig = {
        name: 'new-ruleset',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 456, name: 'old-ruleset' },
        { id: 789, name: 'another-old-ruleset' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.createRepoRuleset.mockResolvedValue({
        data: { id: 999, name: 'new-ruleset' }
      });
      mockOctokit.rest.repos.deleteRepoRuleset.mockResolvedValue({});

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('created');
      expect(result.rulesetId).toBe(999);
      expect(result.deletedRulesets).toHaveLength(2);
      expect(result.deletedRulesets[0].name).toBe('old-ruleset');
      expect(result.deletedRulesets[0].deleted).toBe(true);
      expect(result.deletedRulesets[1].name).toBe('another-old-ruleset');
      expect(result.deletedRulesets[1].deleted).toBe(true);
      expect(mockOctokit.rest.repos.createRepoRuleset).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.repos.deleteRepoRuleset).toHaveBeenCalledTimes(2);
    });

    test('should delete unmanaged rulesets when delete-unmanaged-rulesets is enabled', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'ci2' },
        { id: 789, name: 'old-ruleset' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'deletion' }]
        }
      });
      mockOctokit.rest.repos.deleteRepoRuleset.mockResolvedValue({});

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.deletedRulesets).toHaveLength(2);
      expect(result.deletedRulesets[0].name).toBe('ci2');
      expect(result.deletedRulesets[0].deleted).toBe(true);
      expect(result.deletedRulesets[1].name).toBe('old-ruleset');
      expect(result.deletedRulesets[1].deleted).toBe(true);
      expect(mockOctokit.rest.repos.deleteRepoRuleset).toHaveBeenCalledTimes(2);
      expect(mockOctokit.rest.repos.deleteRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ruleset_id: 456
      });
      expect(mockOctokit.rest.repos.deleteRepoRuleset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ruleset_id: 789
      });
    });

    test('should handle delete-unmanaged-rulesets in dry-run mode', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'ci2' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'deletion' }]
        }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.deletedRulesets).toHaveLength(1);
      expect(result.deletedRulesets[0].name).toBe('ci2');
      expect(result.deletedRulesets[0].wouldDelete).toBe(true);
      expect(result.deletedRulesets[0].deleted).toBe(false);
      expect(mockOctokit.rest.repos.deleteRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle delete-unmanaged-rulesets in dry-run mode when updating', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'unmanaged-ruleset' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'disabled', // Different from config, triggers update
          rules: [{ type: 'deletion' }]
        }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('would-update');
      expect(result.deletedRulesets).toHaveLength(1);
      expect(result.deletedRulesets[0].name).toBe('unmanaged-ruleset');
      expect(result.deletedRulesets[0].wouldDelete).toBe(true);
      expect(result.deletedRulesets[0].deleted).toBe(false);
      expect(mockOctokit.rest.repos.updateRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.deleteRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle delete-unmanaged-rulesets in dry-run mode when creating', async () => {
      const rulesetConfig = {
        name: 'new-ruleset',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [{ id: 456, name: 'unmanaged-ruleset' }];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('would-create');
      expect(result.deletedRulesets).toHaveLength(1);
      expect(result.deletedRulesets[0].name).toBe('unmanaged-ruleset');
      expect(result.deletedRulesets[0].wouldDelete).toBe(true);
      expect(result.deletedRulesets[0].deleted).toBe(false);
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.deleteRepoRuleset).not.toHaveBeenCalled();
    });

    test('should not delete rulesets when delete-unmanaged-rulesets is disabled', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'ci2' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'deletion' }]
        }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.deletedRulesets).toBeUndefined();
      expect(mockOctokit.rest.repos.deleteRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle deletion errors gracefully when deleting unmanaged rulesets', async () => {
      const rulesetConfig = {
        name: 'ci',
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      const existingRulesets = [
        { id: 123, name: 'ci' },
        { id: 456, name: 'ci2' }
      ];

      setMockFileContent(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: existingRulesets
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: {
          id: 123,
          name: 'ci',
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'deletion' }]
        }
      });
      mockOctokit.rest.repos.deleteRepoRuleset.mockRejectedValue(new Error('Permission denied'));

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true, false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('unchanged');
      expect(result.deletedRulesets).toHaveLength(1);
      expect(result.deletedRulesets[0].name).toBe('ci2');
      expect(result.deletedRulesets[0].deleted).toBe(false);
      expect(result.deletedRulesets[0].error).toBe('Permission denied');
    });
  });

  describe('syncPullRequestTemplate', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
      mockOctokit.rest.pulls.update.mockClear();
    });

    test('should create pull request template when it does not exist', async () => {
      const testTemplateContent = '## Description\n\nDescribe your changes here\n\n## Checklist\n\n- [ ] Tests added';

      setMockFileContent(testTemplateContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File does not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 }) // Branch check
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'abc123' } }
        });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42'
        }
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: add pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('created');
      expect(result.prNumber).toBe(42);
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          path: '.github/pull_request_template.md',
          branch: 'pull-request-template-sync'
        })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update pull request template when content differs', async () => {
      const newContent =
        '## Description\n\nDescribe your changes here\n\n## Checklist\n\n- [ ] Tests added\n- [ ] Docs updated';
      const oldContent = '## Description\n\nDescribe your changes here';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
        data: { object: { sha: 'abc123' } }
      });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 43,
          html_url: 'https://github.com/owner/repo/pull/43'
        }
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'file-sha-456'
        })
      );
    });

    test('should not create PR when content is unchanged', async () => {
      const content = '## Description\n\nDescribe your changes here';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with same content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(content).toString('base64')
        }
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('unchanged');
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('should update existing branch when branch already exists', async () => {
      const newContent = '## Description\n\nNew content';
      const oldContent = '## Description\n\nOld content';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-777',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch already exists
      mockOctokit.rest.git.getRef
        .mockResolvedValueOnce({
          // Branch exists
          data: { object: { sha: 'branch-sha-123' } }
        })
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'main-sha-456' } }
        });

      mockOctokit.rest.git.updateRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 44,
          html_url: 'https://github.com/owner/repo/pull/44'
        }
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('updated');
      expect(result.prNumber).toBe(44);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/pull-request-template-sync',
        sha: 'main-sha-456',
        force: true
      });
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update existing PR when content differs', async () => {
      const newContent = '## Description\n\nNew content';
      const oldContent = '## Description\n\nOld content';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // First call: check default branch, second call: check PR branch
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'pull-request-template-sync',
          sha: 'file-sha-pr-branch'
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const content = '## Description\n\nSame content';
      const oldContent = '## Description\n\nOld content';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // Default branch has old content, but PR branch already has the new content
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(content).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('PR #50 already has the latest');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = '## Description\n\nNew template';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PR
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: add pull request template',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncPullRequestTemplate(
        mockOctokit,
        'invalid-repo-format',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing template file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './nonexistent.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file at');
    });

    test('should handle API errors', async () => {
      setMockFileContent('## Description');

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync pull request template');
    });
  });

  describe('syncWorkflowFiles', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
      mockOctokit.rest.pulls.update.mockClear();
    });

    test('should create workflow files when they do not exist', async () => {
      const testWorkflowContent = 'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest';

      setMockFileContent(testWorkflowContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // Files do not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 }) // Branch check
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'abc123' } }
        });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42'
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('created');
      expect(result.prNumber).toBe(42);
      expect(result.filesCreated).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          path: '.github/workflows/ci.yml',
          branch: 'workflow-files-sync'
        })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update workflow files when content differs', async () => {
      const newContent = 'name: CI\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest';
      const oldContent = 'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
        data: { object: { sha: 'abc123' } }
      });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 43,
          html_url: 'https://github.com/owner/repo/pull/43'
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(result.filesUpdated).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'file-sha-456'
        })
      );
    });

    test('should handle multiple workflow files', async () => {
      const ciContent = 'name: CI\non: [push]';
      const releaseContent = 'name: Release\non: [release]';

      mockFs.readFileSync.mockImplementation(path => {
        if (path.includes('ci.yml')) return ciContent;
        if (path.includes('release.yml')) return releaseContent;
        throw new Error('Unknown file');
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // Files do not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 44,
          html_url: 'https://github.com/owner/repo/pull/44'
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml', './workflows/release.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('created');
      expect(result.prNumber).toBe(44);
      expect(result.filesCreated).toContain('.github/workflows/ci.yml');
      expect(result.filesCreated).toContain('.github/workflows/release.yml');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
    });

    test('should not create PR when all files are unchanged', async () => {
      const content = 'name: CI\non: [push]';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // File exists with same content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(content).toString('base64')
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('unchanged');
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('should update existing branch when branch already exists', async () => {
      const newContent = 'name: CI\non: [push, pull_request]';
      const oldContent = 'name: CI\non: [push]';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-777',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      // Branch already exists
      mockOctokit.rest.git.getRef
        .mockResolvedValueOnce({ data: { object: { sha: 'branch-sha-123' } } })
        .mockResolvedValueOnce({ data: { object: { sha: 'main-sha-456' } } });

      mockOctokit.rest.git.updateRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 45,
          html_url: 'https://github.com/owner/repo/pull/45'
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('updated');
      expect(result.prNumber).toBe(45);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/workflow-files-sync',
        sha: 'main-sha-456',
        force: true
      });
    });

    test('should update existing PR when content differs', async () => {
      const newContent = 'name: CI\non: [push, pull_request]';
      const oldContent = 'name: CI\non: [push]';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // First call: check default branch, second call: check PR branch
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'workflow-files-sync',
          sha: 'file-sha-pr-branch'
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should return pr-updated-mixed when existing PR has files created and updated', async () => {
      const ciContent = 'name: CI\non: [push, pull_request]';
      const releaseContent = 'name: Release\non: [release]';
      const oldCiContent = 'name: CI\non: [push]';

      mockFs.readFileSync.mockImplementation(path => {
        if (path.includes('ci.yml')) return ciContent;
        if (path.includes('release.yml')) return releaseContent;
        throw new Error('Unknown file');
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // Mock getContent for default branch check and PR branch check
      // Default branch: ci.yml exists with old content, release.yml doesn't exist
      // PR branch: ci.yml exists with old content (needs update), release.yml doesn't exist (needs creation)
      mockOctokit.rest.repos.getContent.mockImplementation(({ path, ref }) => {
        if (path === '.github/workflows/ci.yml') {
          return Promise.resolve({
            data: {
              sha: ref === 'main' ? 'ci-sha-default' : 'ci-sha-pr',
              content: Buffer.from(oldCiContent).toString('base64')
            }
          });
        }
        // release.yml doesn't exist in default branch or PR branch
        const error = new Error('Not Found');
        error.status = 404;
        return Promise.reject(error);
      });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml', './workflows/release.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('pr-updated-mixed');
      expect(result.prNumber).toBe(50);
      expect(result.filesCreated).toContain('.github/workflows/release.yml');
      expect(result.filesUpdated).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const content = 'name: CI\non: [push]';
      const oldContent = 'name: CI\non: [pull_request]';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // Default branch has old content, but PR branch already has the new content
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(content).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('PR #50 already has the latest');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for new file creation', async () => {
      const newContent = 'name: CI\non: [push]';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(result.filesWouldCreate).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for file update', async () => {
      const newContent = 'name: CI\non: [push, pull_request]';
      const oldContent = 'name: CI\non: [push]';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'existing-sha',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(result.filesWouldUpdate).toContain('.github/workflows/ci.yml');
      expect(result.filesWouldCreate).toBeUndefined();
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode with multiple files', async () => {
      const ciContent = 'name: CI\non: [push]';
      const releaseContent = 'name: Release\non: [release]';

      mockFs.readFileSync.mockImplementation(path => {
        if (path.includes('ci.yml')) return ciContent;
        if (path.includes('release.yml')) return releaseContent;
        throw new Error('Unknown file');
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // Both files don't exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml', './workflows/release.yml'],
        'chore: sync workflows',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(result.message).toBe('Would sync 2 file(s) via PR');
      expect(result.filesWouldCreate).toContain('.github/workflows/ci.yml');
      expect(result.filesWouldCreate).toContain('.github/workflows/release.yml');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode with mixed create and update', async () => {
      const ciContent = 'name: CI\non: [push, pull_request]';
      const releaseContent = 'name: Release\non: [release]';
      const oldCiContent = 'name: CI\non: [push]';

      mockFs.readFileSync.mockImplementation(path => {
        if (path.includes('ci.yml')) return ciContent;
        if (path.includes('release.yml')) return releaseContent;
        throw new Error('Unknown file');
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // ci.yml exists with different content, release.yml does not exist
      mockOctokit.rest.repos.getContent.mockImplementation(({ path }) => {
        if (path === '.github/workflows/ci.yml') {
          return Promise.resolve({
            data: {
              sha: 'ci-sha',
              content: Buffer.from(oldCiContent).toString('base64')
            }
          });
        }
        const error = new Error('Not Found');
        error.status = 404;
        return Promise.reject(error);
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml', './workflows/release.yml'],
        'chore: sync workflows',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('would-create'); // would-create because at least one file is new
      expect(result.dryRun).toBe(true);
      expect(result.message).toBe('Would sync 2 file(s) via PR');
      expect(result.filesWouldCreate).toContain('.github/workflows/release.yml');
      expect(result.filesWouldUpdate).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncWorkflowFiles(
        mockOctokit,
        'invalid-repo-format',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle empty workflow files array', async () => {
      const result = await syncWorkflowFiles(mockOctokit, 'owner/repo', [], 'chore: update workflow files', false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No workflow files specified');
    });

    test('should handle null workflow files array', async () => {
      const result = await syncWorkflowFiles(mockOctokit, 'owner/repo', null, 'chore: update workflow files', false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No workflow files specified');
    });

    test('should handle missing workflow file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./nonexistent.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file at');
    });

    test('should handle API errors', async () => {
      setMockFileContent('name: CI');

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync workflow files');
    });

    test('should handle mixed create and update scenario', async () => {
      const ciContent = 'name: CI\non: [push, pull_request]';
      const releaseContent = 'name: Release\non: [release]';
      const oldCiContent = 'name: CI\non: [push]';

      mockFs.readFileSync.mockImplementation(path => {
        if (path.includes('ci.yml')) return ciContent;
        if (path.includes('release.yml')) return releaseContent;
        throw new Error('Unknown file');
      });

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // ci.yml exists with different content, release.yml does not exist
      mockOctokit.rest.repos.getContent.mockImplementation(({ path }) => {
        if (path === '.github/workflows/ci.yml') {
          return Promise.resolve({
            data: {
              sha: 'ci-sha',
              content: Buffer.from(oldCiContent).toString('base64')
            }
          });
        }
        const error = new Error('Not Found');
        error.status = 404;
        return Promise.reject(error);
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 46,
          html_url: 'https://github.com/owner/repo/pull/46'
        }
      });

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml', './workflows/release.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('mixed');
      expect(result.prNumber).toBe(46);
      expect(result.filesCreated).toContain('.github/workflows/release.yml');
      expect(result.filesUpdated).toContain('.github/workflows/ci.yml');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncAutolinks', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.listAutolinks.mockClear();
      mockOctokit.rest.repos.createAutolink.mockClear();
      mockOctokit.rest.repos.deleteAutolink.mockClear();
    });

    test('should create autolinks when none exist', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('updated');
      expect(result.autolinksCreated).toContain('JIRA-');
      expect(mockOctokit.rest.repos.listAutolinks).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo'
      });
      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        key_prefix: 'JIRA-',
        url_template: 'https://jira.example.com/browse/JIRA-<num>',
        is_alphanumeric: false
      });
    });

    test('should delete autolinks not in config', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      const existingAutolinks = [
        {
          id: 123,
          key_prefix: 'JIRA-',
          url_template: 'https://jira.example.com/browse/JIRA-<num>',
          is_alphanumeric: false
        },
        {
          id: 456,
          key_prefix: 'OLD-',
          url_template: 'https://old.example.com/<num>',
          is_alphanumeric: true
        }
      ];

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: existingAutolinks });
      mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('updated');
      expect(result.autolinksDeleted).toContain('OLD-');
      expect(result.autolinksUnchanged).toBe(1);
      expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        autolink_id: 456
      });
      expect(mockOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    });

    test('should update autolink with same prefix but different settings', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira-new.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      const existingAutolinks = [
        {
          id: 123,
          key_prefix: 'JIRA-',
          url_template: 'https://jira-old.example.com/browse/JIRA-<num>',
          is_alphanumeric: false
        }
      ];

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: existingAutolinks });
      mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('updated');
      expect(result.autolinksDeleted).toContain('JIRA-');
      expect(result.autolinksCreated).toContain('JIRA-');
      expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        autolink_id: 123
      });
      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        key_prefix: 'JIRA-',
        url_template: 'https://jira-new.example.com/browse/JIRA-<num>',
        is_alphanumeric: false
      });
    });

    test('should not change when autolinks are already up to date', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      const existingAutolinks = [
        {
          id: 123,
          key_prefix: 'JIRA-',
          url_template: 'https://jira.example.com/browse/JIRA-<num>',
          is_alphanumeric: false
        }
      ];

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: existingAutolinks });

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('unchanged');
      expect(result.autolinksUnchanged).toBe(1);
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    });

    test('should handle multiple autolinks', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          },
          {
            key_prefix: 'TICKET-',
            url_template: 'https://tickets.example.com/view/<num>',
            is_alphanumeric: true
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('updated');
      expect(result.autolinksCreated).toContain('JIRA-');
      expect(result.autolinksCreated).toContain('TICKET-');
      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledTimes(2);
    });

    test('should handle dry-run mode for creation', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: [] });

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', true);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(result.autolinksWouldCreate).toContain('JIRA-');
      expect(mockOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for deletion', async () => {
      const autolinksConfig = {
        autolinks: []
      };

      const existingAutolinks = [
        {
          id: 123,
          key_prefix: 'OLD-',
          url_template: 'https://old.example.com/<num>',
          is_alphanumeric: true
        }
      ];

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: existingAutolinks });

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', true);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(result.autolinksWouldDelete).toContain('OLD-');
      expect(mockOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncAutolinks(mockOctokit, 'invalid-repo-format', './autolinks.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing autolinks file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './nonexistent.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse autolinks file');
    });

    test('should handle invalid JSON in autolinks file', async () => {
      setMockFileContent('not valid json');

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse autolinks file');
    });

    test('should handle missing autolinks array in config', async () => {
      setMockFileContent(JSON.stringify({ links: [] }));

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('must contain an "autolinks" array');
    });

    test('should handle missing required fields in autolink', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-'
            // Missing url_template
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('must have "key_prefix" and "url_template" fields');
    });

    test('should handle 404 error when listing autolinks', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockRejectedValue({ status: 404 });
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('updated');
      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalled();
    });

    test('should handle API errors', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>',
            is_alphanumeric: false
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync autolinks');
    });

    test('should default is_alphanumeric to true when not specified', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>'
            // is_alphanumeric not specified
          }
        ]
      };

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: [] });
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({});

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        key_prefix: 'JIRA-',
        url_template: 'https://jira.example.com/browse/JIRA-<num>',
        is_alphanumeric: true
      });
    });

    test('should match autolink with default is_alphanumeric as unchanged', async () => {
      const autolinksConfig = {
        autolinks: [
          {
            key_prefix: 'JIRA-',
            url_template: 'https://jira.example.com/browse/JIRA-<num>'
            // is_alphanumeric not specified (defaults to true)
          }
        ]
      };

      const existingAutolinks = [
        {
          id: 123,
          key_prefix: 'JIRA-',
          url_template: 'https://jira.example.com/browse/JIRA-<num>',
          is_alphanumeric: true
        }
      ];

      setMockFileContent(JSON.stringify(autolinksConfig));
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({ data: existingAutolinks });

      const result = await syncAutolinks(mockOctokit, 'owner/repo', './autolinks.json', false);

      expect(result.success).toBe(true);
      expect(result.autolinks).toBe('unchanged');
      expect(mockOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
    });
  });

  describe('syncGitignore', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
    });

    test('should create .gitignore when it does not exist', async () => {
      const testContent = 'node_modules/\n.env\n';

      setMockFileContent(testContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // File does not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 42, html_url: 'https://github.com/owner/repo/pull/42' }
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: add .gitignore', false);

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('created');
      expect(result.prNumber).toBe(42);
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          path: '.gitignore',
          branch: 'gitignore-sync'
        })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update .gitignore when content differs', async () => {
      const newContent = 'node_modules/\n.env\ndist/\n';
      const oldContent = 'node_modules/\n.env\n';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 43, html_url: 'https://github.com/owner/repo/pull/43' }
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ sha: 'file-sha-456' })
      );
    });

    test('should preserve repo-specific content after marker', async () => {
      const newContent = 'node_modules/\n.env\n';
      const marker = '# Repository-specific entries (preserved during sync)';
      const repoSpecific = `${marker}\n# Custom entries\n*.custom\n`;
      const oldContent = `node_modules/\nold-entry/\n${repoSpecific}`;

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // File exists with repo-specific content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 44, html_url: 'https://github.com/owner/repo/pull/44' }
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(true);
      // Verify repo-specific content is preserved
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(String)
        })
      );
      // Decode and verify the content includes the repo-specific marker
      const call = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const content = Buffer.from(call.content, 'base64').toString('utf8');
      expect(content).toContain(marker);
      expect(content).toContain('*.custom');
    });

    test('should not create PR when content is unchanged', async () => {
      const content = 'node_modules/\n.env\n';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // File exists with same content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-999',
          content: Buffer.from(content).toString('base64')
        }
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('unchanged');
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('should update existing PR when content differs', async () => {
      const newContent = 'node_modules/\n.env\ndist/\n';
      const oldContent = 'node_modules/\n.env\n';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // First call: check default branch, second call: check PR branch
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 50, html_url: 'https://github.com/owner/repo/pull/50' }]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'gitignore-sync',
          sha: 'file-sha-pr-branch'
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const content = 'node_modules/\n.env\n';
      const oldContent = 'node_modules/\n';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // Default branch has old content, but PR branch already has the new content
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(content).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 50, html_url: 'https://github.com/owner/repo/pull/50' }]
      });

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('PR #50 already has the latest');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = 'node_modules/\n.env\n';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      // No existing PR
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncGitignore(
        mockOctokit,
        'owner/repo',
        './.gitignore',
        'chore: add .gitignore',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.gitignore).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncGitignore(
        mockOctokit,
        'invalid-repo-format',
        './.gitignore',
        'chore: update .gitignore',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing .gitignore file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncGitignore(
        mockOctokit,
        'owner/repo',
        './nonexistent.gitignore',
        'chore: update .gitignore',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file');
      expect(result.error).toContain('.gitignore');
    });

    test('should handle API errors', async () => {
      setMockFileContent('node_modules/\n');

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncGitignore(mockOctokit, 'owner/repo', './.gitignore', 'chore: update .gitignore', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync .gitignore');
    });
  });

  describe('syncCopilotInstructions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
      mockOctokit.rest.pulls.update.mockClear();
    });

    test('should create copilot-instructions.md when it does not exist', async () => {
      const testContent = '# GitHub Copilot Instructions\n\nPlease follow our coding standards.';

      setMockFileContent(testContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File does not exist
      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 }) // Branch check
        .mockResolvedValueOnce({
          // Default branch ref
          data: { object: { sha: 'abc123' } }
        });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42'
        }
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: add copilot-instructions.md',
        false
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('created');
      expect(result.prNumber).toBe(42);
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          path: '.github/copilot-instructions.md',
          branch: 'copilot-instructions-md-sync'
        })
      );
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });

    test('should update copilot-instructions.md when content differs', async () => {
      const newContent = '# GitHub Copilot Instructions\n\nUpdated coding standards.';
      const oldContent = '# GitHub Copilot Instructions\n\nOld coding standards.';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with different content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(oldContent).toString('base64')
        }
      });

      // No existing PRs
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      // Branch doesn't exist
      mockOctokit.rest.git.getRef.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
        data: { object: { sha: 'abc123' } }
      });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          number: 43,
          html_url: 'https://github.com/owner/repo/pull/43'
        }
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: 'file-sha-456'
        })
      );
    });

    test('should not create PR when content is unchanged', async () => {
      const content = '# GitHub Copilot Instructions\n\nCoding standards.';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // File exists with same content
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(content).toString('base64')
        }
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('unchanged');
      expect(result.message).toContain('already up to date');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('should update existing PR when content differs', async () => {
      const newContent = '# GitHub Copilot Instructions\n\nUpdated standards.';
      const oldContent = '# GitHub Copilot Instructions\n\nOld standards.';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // First call: check default branch, second call: check PR branch
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(oldContent).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'new-commit-sha' } }
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'copilot-instructions-md-sync',
          sha: 'file-sha-pr-branch'
        })
      );
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const content = '# GitHub Copilot Instructions\n\nSame standards.';
      const oldContent = '# GitHub Copilot Instructions\n\nOld standards.';

      setMockFileContent(content);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      // Default branch has old content, but PR branch already has the new content
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(oldContent).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-pr-branch',
            content: Buffer.from(content).toString('base64')
          }
        });

      // Existing PR found
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 50,
            html_url: 'https://github.com/owner/repo/pull/50'
          }
        ]
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(result.message).toContain('PR #50 already has the latest');
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = '# GitHub Copilot Instructions\n\nNew standards.';

      setMockFileContent(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent.mockRejectedValue({
        status: 404
      });

      // No existing PR
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: []
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: add copilot-instructions.md',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.copilotInstructions).toBe('would-create');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncCopilotInstructions(
        mockOctokit,
        'invalid-repo-format',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing copilot-instructions.md file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './nonexistent.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file at');
      expect(result.error).toContain('copilot-instructions.md');
    });

    test('should handle API errors', async () => {
      setMockFileContent('# Copilot Instructions');

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncCopilotInstructions(
        mockOctokit,
        'owner/repo',
        './copilot-instructions.md',
        'chore: update copilot-instructions.md',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync copilot-instructions.md');
    });
  });

  describe('syncPackageJson', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockOctokit.rest.repos.get.mockClear();
      mockOctokit.rest.repos.getContent.mockClear();
      mockOctokit.rest.repos.createOrUpdateFileContents.mockClear();
      mockOctokit.rest.git.getRef.mockClear();
      mockOctokit.rest.git.createRef.mockClear();
      mockOctokit.rest.git.updateRef.mockClear();
      mockOctokit.rest.pulls.list.mockClear();
      mockOctokit.rest.pulls.create.mockClear();
    });

    test('should update scripts when they differ', async () => {
      const sourcePackageJson = {
        name: 'source-package',
        scripts: {
          test: 'jest',
          lint: 'eslint .'
        }
      };
      const existingPackageJson = {
        name: 'target-package',
        version: '1.0.0',
        scripts: {
          test: 'mocha'
        }
      };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-456',
          content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 43, html_url: 'https://github.com/owner/repo/pull/43' }
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('updated');
      expect(result.prNumber).toBe(43);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].field).toBe('scripts');

      // Verify the committed content preserves existing fields
      const call = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const committedContent = JSON.parse(Buffer.from(call.content, 'base64').toString('utf8'));
      expect(committedContent.name).toBe('target-package');
      expect(committedContent.version).toBe('1.0.0');
      expect(committedContent.scripts.test).toBe('jest');
      expect(committedContent.scripts.lint).toBe('eslint .');
    });

    test('should update engines when they differ', async () => {
      const sourcePackageJson = {
        name: 'source-package',
        engines: {
          node: '>=22.0.0',
          npm: '>=10.0.0'
        }
      };
      const existingPackageJson = {
        name: 'target-package',
        version: '1.0.0',
        engines: {
          node: '>=20.0.0'
        }
      };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-engines',
          content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 44, html_url: 'https://github.com/owner/repo/pull/44' }
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        false, // syncScripts
        true, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('updated');
      expect(result.prNumber).toBe(44);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].field).toBe('engines');

      // Verify the committed content preserves existing fields and has new engines
      const call = mockOctokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
      const committedContent = JSON.parse(Buffer.from(call.content, 'base64').toString('utf8'));
      expect(committedContent.name).toBe('target-package');
      expect(committedContent.version).toBe('1.0.0');
      expect(committedContent.engines.node).toBe('>=22.0.0');
      expect(committedContent.engines.npm).toBe('>=10.0.0');
    });

    test('should update both scripts and engines when both are enabled', async () => {
      const sourcePackageJson = {
        scripts: { test: 'jest' },
        engines: { node: '>=22.0.0' }
      };
      const existingPackageJson = {
        scripts: { test: 'mocha' },
        engines: { node: '>=20.0.0' }
      };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-both',
          content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      mockOctokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

      mockOctokit.rest.git.createRef.mockResolvedValue({});
      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 45, html_url: 'https://github.com/owner/repo/pull/45' }
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        true, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('updated');
      expect(result.changes).toHaveLength(2);
      expect(result.changes.map(c => c.field)).toContain('scripts');
      expect(result.changes.map(c => c.field)).toContain('engines');
    });

    test('should not create PR when content is unchanged', async () => {
      const packageJson = {
        name: 'test-package',
        scripts: { test: 'jest' }
      };

      setMockFileContent(JSON.stringify(packageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-789',
          content: Buffer.from(JSON.stringify(packageJson)).toString('base64')
        }
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('unchanged');
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should update existing PR when content differs', async () => {
      const sourcePackageJson = { scripts: { test: 'jest' } };
      const existingPackageJson = { scripts: { test: 'mocha' } };
      const prBranchPackageJson = { scripts: { test: 'old-test' } };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // First call: get existing package.json from default branch
      // Second call: get package.json from PR branch
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-111',
            content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'pr-file-sha-111',
            content: Buffer.from(JSON.stringify(prBranchPackageJson)).toString('base64')
          }
        });

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 50, html_url: 'https://github.com/owner/repo/pull/50' }]
      });

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'updated-sha' } }
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('pr-updated');
      expect(result.prNumber).toBe(50);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'package-json-sync',
          sha: 'pr-file-sha-111'
        })
      );
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should report pr-up-to-date when PR exists with same content', async () => {
      const sourcePackageJson = { scripts: { test: 'jest' } };
      const existingPackageJson = { scripts: { test: 'mocha' } };
      // PR branch already has the source scripts
      const prBranchPackageJson = { scripts: { test: 'jest' } };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // First call: get existing package.json from default branch (different from source)
      // Second call: get package.json from PR branch (same as source)
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'pr-file-sha',
            content: Buffer.from(JSON.stringify(prBranchPackageJson)).toString('base64')
          }
        });

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 50, html_url: 'https://github.com/owner/repo/pull/50' }]
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('pr-up-to-date');
      expect(result.prNumber).toBe(50);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const sourcePackageJson = { scripts: { test: 'jest' } };
      const existingPackageJson = { scripts: { test: 'mocha' } };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-222',
          content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
        }
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should return would-update-pr in dry-run mode when PR exists and needs update', async () => {
      const sourcePackageJson = { scripts: { test: 'jest' } };
      const existingPackageJson = { scripts: { test: 'mocha' } };
      const prBranchPackageJson = { scripts: { test: 'old-test' } };

      setMockFileContent(JSON.stringify(sourcePackageJson));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      // First call: get existing package.json from default branch
      // Second call: get package.json from PR branch (different from source, needs update)
      mockOctokit.rest.repos.getContent
        .mockResolvedValueOnce({
          data: {
            sha: 'file-sha-default',
            content: Buffer.from(JSON.stringify(existingPackageJson)).toString('base64')
          }
        })
        .mockResolvedValueOnce({
          data: {
            sha: 'pr-file-sha',
            content: Buffer.from(JSON.stringify(prBranchPackageJson)).toString('base64')
          }
        });

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 50, html_url: 'https://github.com/owner/repo/pull/50' }]
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        true // dry-run
      );

      expect(result.success).toBe(true);
      expect(result.packageJson).toBe('would-update-pr');
      expect(result.prNumber).toBe(50);
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should fail when package.json does not exist in target repo', async () => {
      setMockFileContent(JSON.stringify({ scripts: {} }));

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      const error = new Error('Not Found');
      error.status = 404;
      mockOctokit.rest.repos.getContent.mockRejectedValue(error);

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('should fail when neither syncScripts nor syncEngines is enabled', async () => {
      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        false, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one of syncScripts or syncEngines must be enabled');
    });

    test('should handle invalid repository format', async () => {
      const result = await syncPackageJson(
        mockOctokit,
        'invalid-repo-format',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing source package.json file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './nonexistent.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse package.json');
    });

    test('should handle API errors', async () => {
      setMockFileContent(JSON.stringify({ scripts: {} }));

      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncPackageJson(
        mockOctokit,
        'owner/repo',
        './package.json',
        true, // syncScripts
        false, // syncEngines
        'chore: update package.json',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to sync package.json');
    });
  });

  describe('pr-up-to-date status handling in summary', () => {
    test('should show pending merge message for dependabot when PR is up-to-date', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'dependabot-yml': './dependabot.yml'
        };
        return inputs[name] || '';
      });

      // Mock repo settings
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });

      // Mock dependabot.yml source content
      const sourceContent = 'version: 2\nupdates: []';
      setMockFileContent(sourceContent);

      // For pr-up-to-date: default branch has DIFFERENT content, PR branch has SAME content
      const oldDefaultBranchContent = 'version: 2\nupdates: [old]';
      mockOctokit.rest.repos.getContent.mockImplementation(async ({ ref }) => {
        if (ref === 'dependabot-yml-sync') {
          // PR branch has the latest content (matches source)
          return {
            data: {
              content: Buffer.from(sourceContent).toString('base64'),
              sha: 'pr-branch-sha'
            }
          };
        }
        // Default branch (main) has old/different content
        return {
          data: {
            content: Buffer.from(oldDefaultBranchContent).toString('base64'),
            sha: 'default-branch-sha'
          }
        };
      });

      // Mock existing open PR for this branch
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 42,
            html_url: 'https://github.com/owner/repo1/pull/42'
          }
        ]
      });

      await run();

      // Verify the summary table shows the pending merge message
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('dependabot.yml PR #42 up-to-date (pending merge)');
    });

    test('should show pending merge message for workflow files when PR is up-to-date', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'workflow-files': './workflow.yml'
        };
        return inputs[name] || '';
      });

      // Mock repo settings
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });

      // Mock workflow file source content
      const sourceContent = 'name: test\non: push';
      setMockFileContent(sourceContent);

      // For pr-up-to-date: default branch has DIFFERENT content, PR branch has SAME content
      const oldDefaultBranchContent = 'name: old\non: push';
      mockOctokit.rest.repos.getContent.mockImplementation(async ({ ref }) => {
        if (ref === 'workflow-files-sync') {
          // PR branch has the latest content (matches source)
          return {
            data: {
              content: Buffer.from(sourceContent).toString('base64'),
              sha: 'pr-branch-sha'
            }
          };
        }
        // Default branch (main) has old/different content
        return {
          data: {
            content: Buffer.from(oldDefaultBranchContent).toString('base64'),
            sha: 'default-branch-sha'
          }
        };
      });

      // Mock existing open PR for this branch
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 99,
            html_url: 'https://github.com/owner/repo1/pull/99'
          }
        ]
      });

      await run();

      // Verify the summary table shows the pending merge message
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      expect(repoRow[2]).toContain('workflow files PR #99 up-to-date (pending merge)');
    });

    test('should identify pr-up-to-date as reportable change (not no-changes-needed)', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'github-token': 'test-token',
          repositories: 'owner/repo1',
          'dependabot-yml': './dependabot.yml'
        };
        return inputs[name] || '';
      });

      // Mock repo settings - all match so no settings changes
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main',
          permissions: { admin: true },
          allow_squash_merge: true,
          allow_merge_commit: true,
          allow_rebase_merge: true,
          delete_branch_on_merge: false,
          allow_auto_merge: false,
          allow_update_branch: false
        }
      });

      // Mock dependabot.yml source content
      const sourceContent = 'version: 2\nupdates: []';
      setMockFileContent(sourceContent);

      // For pr-up-to-date: default branch has DIFFERENT content, PR branch has SAME content
      const oldDefaultBranchContent = 'version: 2\nupdates: [old]';
      mockOctokit.rest.repos.getContent.mockImplementation(async ({ ref }) => {
        if (ref === 'dependabot-yml-sync') {
          // PR branch has the latest content (matches source)
          return {
            data: {
              content: Buffer.from(sourceContent).toString('base64'),
              sha: 'pr-branch-sha'
            }
          };
        }
        // Default branch (main) has old/different content
        return {
          data: {
            content: Buffer.from(oldDefaultBranchContent).toString('base64'),
            sha: 'default-branch-sha'
          }
        };
      });

      // Mock existing open PR with same content (pr-up-to-date scenario)
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [
          {
            number: 42,
            html_url: 'https://github.com/owner/repo1/pull/42'
          }
        ]
      });

      await run();

      // The summary should NOT show "No changes needed" - it should show the pending PR
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      const tableCall = mockCore.summary.addTable.mock.calls[0][0];
      const repoRow = tableCall.find(row => row[0] === 'owner/repo1');
      expect(repoRow).toBeDefined();
      // Should show the pending merge message, NOT "No changes needed"
      expect(repoRow[2]).not.toBe('No changes needed');
      expect(repoRow[2]).toContain('pending merge');
    });
  });

  describe('getKnownRepoConfigKeys cache and error handling', () => {
    test('should cache known repo config keys across calls', async () => {
      // Reset cache to start fresh
      resetKnownRepoConfigKeysCache();

      // Setup mock that tracks calls
      let readCount = 0;
      mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
        if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
          readCount++;
          return mockActionYmlContent;
        }
        return '';
      });

      // Parse repositories twice - should only read action.yml once due to caching
      setMockYamlContent({ repos: [{ repo: 'owner/repo1', 'unknown-key': true }] });
      await parseRepositories('', 'repos.yml', '', mockOctokit);

      setMockYamlContent({ repos: [{ repo: 'owner/repo2', 'another-unknown': true }] });
      await parseRepositories('', 'repos2.yml', '', mockOctokit);

      // action.yml should only be read once (cached after first call)
      expect(readCount).toBe(1);
    });

    test('should warn and fallback when action.yml cannot be read', async () => {
      // Reset cache to force re-read
      resetKnownRepoConfigKeysCache();

      // Mock fs.readFileSync to throw error for action.yml
      mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
        if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
          throw new Error('ENOENT: no such file or directory');
        }
        return '';
      });

      // Parse repositories with a known key (repo) and unknown key
      setMockYamlContent({ repos: [{ repo: 'owner/repo1', 'allow-squash-merge': false }] });
      await parseRepositories('', 'repos.yml', '', mockOctokit);

      // Should warn about failing to read action.yml
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Could not read action.yml to determine valid configuration keys')
      );

      // With fallback, only 'repo' is known, so 'allow-squash-merge' should be flagged as unknown
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Unknown configuration key "allow-squash-merge"')
      );
    });

    test('should reset cache when resetKnownRepoConfigKeysCache is called', async () => {
      // Setup mock that tracks calls
      let readCount = 0;
      mockFs.readFileSync.mockImplementation((filePath, _encoding) => {
        if (typeof filePath === 'string' && filePath.endsWith('action.yml')) {
          readCount++;
          return mockActionYmlContent;
        }
        return '';
      });

      // Reset and parse - should read action.yml
      resetKnownRepoConfigKeysCache();
      setMockYamlContent({ repos: [{ repo: 'owner/repo1' }] });
      await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(readCount).toBe(1);

      // Parse again without reset - should NOT read action.yml (cached)
      setMockYamlContent({ repos: [{ repo: 'owner/repo2' }] });
      await parseRepositories('', 'repos2.yml', '', mockOctokit);
      expect(readCount).toBe(1);

      // Reset and parse again - should read action.yml again
      resetKnownRepoConfigKeysCache();
      setMockYamlContent({ repos: [{ repo: 'owner/repo3' }] });
      await parseRepositories('', 'repos3.yml', '', mockOctokit);
      expect(readCount).toBe(2);
    });
  });
});
