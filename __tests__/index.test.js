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
      getAllTopics: jest.fn()
    },
    codeScanning: {
      updateDefaultSetup: jest.fn(),
      getDefaultSetup: jest.fn()
    },
    orgs: {
      get: jest.fn()
    }
  }
};

// Mock fs module
const mockFs = {
  readFileSync: jest.fn()
};

// Mock yaml module
const mockYaml = {
  load: jest.fn()
};

// Mock the modules before importing the main module
jest.unstable_mockModule('@actions/core', () => mockCore);
jest.unstable_mockModule('@actions/github', () => mockGithub);
jest.unstable_mockModule('@octokit/rest', () => ({
  Octokit: jest.fn(() => mockOctokit)
}));
jest.unstable_mockModule('fs', () => mockFs);
jest.unstable_mockModule('js-yaml', () => mockYaml);

// Import the main module and helper functions after mocking
const { default: run, parseRepositories, updateRepositorySettings } = await import('../src/index.js');

describe('Bulk GitHub Repository Settings Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Octokit mock
    mockOctokit.rest.repos.update.mockClear();
    mockOctokit.rest.repos.listForUser.mockClear();
    mockOctokit.rest.repos.listForOrg.mockClear();
    mockOctokit.rest.repos.replaceAllTopics.mockClear();
    mockOctokit.rest.codeScanning.updateDefaultSetup.mockClear();
    mockOctokit.rest.orgs.get.mockClear();

    // Set default inputs
    mockCore.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'test-token',
        repositories: '',
        'repositories-file': '',
        owner: '',
        'allow-squash-merge': '',
        'allow-merge-commit': '',
        'allow-rebase-merge': '',
        'allow-auto-merge': '',
        'delete-branch-on-merge': '',
        'allow-update-branch': '',
        'enable-default-code-scanning': '',
        topics: '',
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
      mockFs.readFileSync.mockReturnValue('repos:\n  - repo: owner/repo1\n  - repo: owner/repo2');
      mockYaml.load.mockReturnValue({
        repos: [{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
    });

    test('should parse repository list with settings overrides', async () => {
      mockFs.readFileSync.mockReturnValue(
        'repos:\n  - repo: owner/repo1\n    allow-squash-merge: false\n  - repo: owner/repo2'
      );
      mockYaml.load.mockReturnValue({
        repos: [{ repo: 'owner/repo1', 'allow-squash-merge': false }, { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1', 'allow-squash-merge': false }, { repo: 'owner/repo2' }]);
    });

    test('should handle mixed string and object format in repos array', async () => {
      mockFs.readFileSync.mockReturnValue('repos:\n  - owner/repo1\n  - repo: owner/repo2');
      mockYaml.load.mockReturnValue({
        repos: ['owner/repo1', { repo: 'owner/repo2' }]
      });

      const result = await parseRepositories('', 'repos.yml', '', mockOctokit);
      expect(result).toEqual([{ repo: 'owner/repo1' }, { repo: 'owner/repo2' }]);
    });

    test('should reject YAML file without repos array', async () => {
      mockFs.readFileSync.mockReturnValue('repositories:\n  - owner/repo1');
      mockYaml.load.mockReturnValue({
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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, topics, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, topics, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

      expect(result.success).toBe(true);
      expect(mockOctokit.rest.repos.getAllTopics).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.replaceAllTopics).not.toHaveBeenCalled();
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

      await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        allow_squash_merge: true,
        delete_branch_on_merge: true
      });
    });

    test('should handle invalid repository format', async () => {
      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'invalid-repo', settings, false, null, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid repository format. Expected "owner/repo"');
    });

    test('should handle API errors', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API Error'));

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    test('should handle 403 access denied errors with warning', async () => {
      const error403 = new Error('Forbidden');
      error403.status = 403;
      mockOctokit.rest.repos.get.mockRejectedValue(error403);

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

      expect(result.success).toBe(false);
      expect(result.insufficientPermissions).toBe(true);
      expect(result.error).toContain('Cannot read repository settings');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('GitHub App may not be installed on this repository')
      );
    });

    test('should handle missing admin permissions in non-dry-run mode', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'owner/repo',
          allow_squash_merge: true, // Has the settings (app is installed)
          permissions: {
            admin: false, // But no admin permission
            push: true,
            pull: true
          }
        }
      });

      const settings = { allow_squash_merge: false };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, false);

      expect(result.success).toBe(false);
      expect(result.insufficientPermissions).toBe(true);
      expect(result.error).toContain('Missing admin permissions');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Missing admin permissions for repository owner/repo')
      );
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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, true); // dry-run

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

      const settings = { allow_squash_merge: true };
      const topics = ['javascript', 'test'];

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, topics, true);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.topicsWouldUpdate).toBe(true);
      expect(result.codeScanningWouldEnable).toBe(true);
      expect(mockOctokit.rest.repos.get).toHaveBeenCalled(); // Should fetch current state
      expect(mockOctokit.rest.repos.update).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.replaceAllTopics).not.toHaveBeenCalled();
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).not.toHaveBeenCalled();
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
        'Action failed with error: At least one repository setting must be specified (or enable-default-code-scanning must be true, or topics must be provided)'
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
          'enable-default-code-scanning': 'true'
        };
        return inputs[name] || '';
      });

      mockOctokit.rest.repos.update.mockResolvedValue({});
      mockOctokit.rest.codeScanning.updateDefaultSetup.mockResolvedValue({});

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('updated-repositories', '1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('failed-repositories', '0');
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).toHaveBeenCalledTimes(1);
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
  });
});
