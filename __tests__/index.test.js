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
      updateRepoRuleset: jest.fn()
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
const {
  default: run,
  parseRepositories,
  updateRepositorySettings,
  syncDependabotYml,
  syncRepositoryRuleset,
  syncPullRequestTemplate,
  syncWorkflowFiles
} = await import('../src/index.js');

describe('Bulk GitHub Repository Settings Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
        'enable-default-code-scanning': '',
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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, null, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, topics, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, topics, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, false, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, true, null, false);

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

      expect(result.success).toBe(true);
      // request should not be called at all when immutableReleases is null
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

      await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

      expect(mockOctokit.rest.repos.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        allow_squash_merge: true,
        delete_branch_on_merge: true
      });
    });

    test('should handle invalid repository format', async () => {
      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'invalid-repo', settings, false, null, null, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid repository format. Expected "owner/repo"');
    });

    test('should handle API errors', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API Error'));

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });

    test('should handle 403 access denied errors with warning', async () => {
      const error403 = new Error('Forbidden');
      error403.status = 403;
      mockOctokit.rest.repos.get.mockRejectedValue(error403);

      const settings = { allow_squash_merge: true };
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, false);

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
      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, false, null, null, true); // dry-run

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

      const result = await updateRepositorySettings(mockOctokit, 'owner/repo', settings, true, true, topics, true);

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
        'Action failed with error: At least one repository setting must be specified (or enable-default-code-scanning must be true, or immutable-releases must be specified, or topics must be provided, or dependabot-yml must be specified, or rulesets-file must be specified, or pull-request-template must be specified, or workflow-files must be specified)'
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
      expect(mockOctokit.rest.codeScanning.updateDefaultSetup).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo1',
        state: 'configured',
        query_suite: 'default'
      });
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

      mockFs.readFileSync.mockReturnValue(testDependabotContent);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

      mockFs.readFileSync.mockReturnValue(content);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

    test('should report existing open PR when one exists', async () => {
      const newContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "daily"';
      const oldContent =
        'version: 2\nupdates:\n  - package-ecosystem: "npm"\n    directory: "/"\n    schedule:\n      interval: "weekly"';

      mockFs.readFileSync.mockReturnValue(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-999',
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
        false
      );

      expect(result.success).toBe(true);
      expect(result.dependabotYml).toBe('pr-exists');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = 'version: 2\nupdates:\n  - package-ecosystem: "npm"';

      mockFs.readFileSync.mockReturnValue(newContent);

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
      expect(result.error).toContain('Failed to read dependabot.yml file');
    });

    test('should handle API errors', async () => {
      mockFs.readFileSync.mockReturnValue('version: 2');

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 456, name: 'ci', enforcement: 'disabled' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });
      mockOctokit.rest.repos.updateRepoRuleset.mockResolvedValue({
        data: { id: 456, name: 'ci' }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 789, name: 'ci' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({ data: [] });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true);

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockResolvedValue({
        data: [{ id: 456, name: 'ci', enforcement: 'disabled' }]
      });
      mockOctokit.rest.repos.getRepoRuleset.mockResolvedValue({
        data: existingRuleset
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', true);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('would-update');
      expect(result.dryRun).toBe(true);
      expect(mockOctokit.rest.repos.getRepoRuleset).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.updateRepoRuleset).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createRepoRuleset).not.toHaveBeenCalled();
    });

    test('should handle invalid repository format', async () => {
      const result = await syncRepositoryRuleset(mockOctokit, 'invalid-repo-format', './ruleset.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository format');
    });

    test('should handle missing ruleset file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './nonexistent.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse ruleset file');
    });

    test('should handle invalid JSON in ruleset file', async () => {
      mockFs.readFileSync.mockReturnValue('{ invalid json }');

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './invalid.json', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read or parse ruleset file');
    });

    test('should handle ruleset without name', async () => {
      const rulesetConfig = {
        target: 'branch',
        enforcement: 'active',
        rules: [{ type: 'deletion' }]
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      mockOctokit.rest.repos.getRepoRulesets.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(rulesetConfig));
      const error404 = new Error('Not Found');
      error404.status = 404;
      mockOctokit.rest.repos.getRepoRulesets.mockRejectedValue(error404);
      mockOctokit.rest.repos.createRepoRuleset.mockResolvedValue({
        data: { id: 123, name: 'ci' }
      });

      const result = await syncRepositoryRuleset(mockOctokit, 'owner/repo', './ruleset.json', false);

      expect(result.success).toBe(true);
      expect(result.ruleset).toBe('created');
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

      mockFs.readFileSync.mockReturnValue(testTemplateContent);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

      mockFs.readFileSync.mockReturnValue(content);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

    test('should report existing open PR when one exists', async () => {
      const newContent = '## Description\n\nNew content';
      const oldContent = '## Description\n\nOld content';

      mockFs.readFileSync.mockReturnValue(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: {
          default_branch: 'main'
        }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-999',
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

      const result = await syncPullRequestTemplate(
        mockOctokit,
        'owner/repo',
        './pull_request_template.md',
        'chore: update pull request template',
        false
      );

      expect(result.success).toBe(true);
      expect(result.pullRequestTemplate).toBe('pr-exists');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode', async () => {
      const newContent = '## Description\n\nNew template';

      mockFs.readFileSync.mockReturnValue(newContent);

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
      expect(result.error).toContain('Failed to read pull request template file');
    });

    test('should handle API errors', async () => {
      mockFs.readFileSync.mockReturnValue('## Description');

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

      mockFs.readFileSync.mockReturnValue(testWorkflowContent);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

      mockFs.readFileSync.mockReturnValue(content);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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

    test('should report existing open PR when one exists', async () => {
      const newContent = 'name: CI\non: [push, pull_request]';
      const oldContent = 'name: CI\non: [push]';

      mockFs.readFileSync.mockReturnValue(newContent);

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' }
      });

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          sha: 'file-sha-999',
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

      const result = await syncWorkflowFiles(
        mockOctokit,
        'owner/repo',
        ['./workflows/ci.yml'],
        'chore: update workflow files',
        false
      );

      expect(result.success).toBe(true);
      expect(result.workflowFiles).toBe('pr-exists');
      expect(result.prNumber).toBe(50);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/50');
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.git.updateRef).not.toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('should handle dry-run mode for new file creation', async () => {
      const newContent = 'name: CI\non: [push]';

      mockFs.readFileSync.mockReturnValue(newContent);

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

      mockFs.readFileSync.mockReturnValue(newContent);

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
      expect(result.error).toContain('Failed to read workflow file');
    });

    test('should handle API errors', async () => {
      mockFs.readFileSync.mockReturnValue('name: CI');

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
});
