/**
 * Tests for the Hello World Action
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
      get: jest.fn()
    }
  }
};

// Mock the modules before importing the main module
jest.unstable_mockModule('@actions/core', () => mockCore);
jest.unstable_mockModule('@actions/github', () => mockGithub);
jest.unstable_mockModule('@octokit/rest', () => ({
  Octokit: jest.fn(() => mockOctokit)
}));

// Import the main module and helper functions after mocking
const { default: run, createGreeting, getCurrentTime, getRepoStats } = await import('../src/index.js');

describe('Hello World Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Octokit mock
    mockOctokit.rest.repos.get.mockClear();

    // Set default inputs
    mockCore.getInput.mockImplementation(name => {
      const inputs = {
        'who-to-greet': 'World',
        'message-prefix': 'Hello',
        'github-token': ''
      };
      return inputs[name] || '';
    });
  });

  describe('createGreeting', () => {
    test('should create correct greeting with default values', () => {
      const result = createGreeting('Hello', 'World');
      expect(result).toBe('Hello, World!');
    });

    test('should create correct greeting with custom values', () => {
      const result = createGreeting('Hi', 'GitHub');
      expect(result).toBe('Hi, GitHub!');
    });

    test('should handle empty prefix', () => {
      const result = createGreeting('', 'World');
      expect(result).toBe(', World!');
    });

    test('should handle empty name', () => {
      const result = createGreeting('Hello', '');
      expect(result).toBe('Hello, !');
    });
  });

  describe('getCurrentTime', () => {
    test('should return a valid ISO timestamp', () => {
      const result = getCurrentTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should return different timestamps when called multiple times', async () => {
      const time1 = getCurrentTime();
      // Wait a bit longer to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const time2 = getCurrentTime();
      expect(time1).not.toBe(time2);
    });
  });

  describe('Action execution', () => {
    test('should handle default inputs correctly', async () => {
      await run();

      expect(mockCore.getInput).toHaveBeenCalledWith('who-to-greet');
      expect(mockCore.getInput).toHaveBeenCalledWith('message-prefix');
      expect(mockCore.getInput).toHaveBeenCalledWith('include-time');
      expect(mockCore.setOutput).toHaveBeenCalledWith('message', 'Hello, World!');
      expect(mockCore.info).toHaveBeenCalledWith('Generated greeting: Hello, World!');
    });

    test('should include time when requested', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'who-to-greet': 'World',
          'message-prefix': 'Hello',
          'include-time': 'true', // Set to 'true' string to trigger time inclusion
          'github-token': ''
        };
        return inputs[name] || '';
      });

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('message', 'Hello, World!');
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'time',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      );
    });

    test('should handle custom inputs', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'who-to-greet': 'GitHub',
          'message-prefix': 'Hi'
        };
        return inputs[name] || '';
      });

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('message', 'Hi, GitHub!');
    });

    test('should create summary table', async () => {
      await run();

      expect(mockCore.summary.addHeading).toHaveBeenCalledWith('Hello World Action Results');
      expect(mockCore.summary.addTable).toHaveBeenCalled();
      expect(mockCore.summary.write).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      mockCore.setOutput.mockImplementation(() => {
        throw new Error('Test error');
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Test error');
    });
  });

  describe('Error handling', () => {
    test('should handle invalid inputs gracefully', () => {
      expect(() => createGreeting(null, 'World')).not.toThrow();
      expect(() => createGreeting('Hello', null)).not.toThrow();
    });
  });

  describe('Time formatting', () => {
    test('should format time as ISO string', () => {
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.now = originalDate.now;

      const result = getCurrentTime();
      expect(result).toBe('2023-01-01T12:00:00.000Z');

      global.Date = originalDate;
    });
  });

  describe('getRepoStats', () => {
    test('should fetch repository statistics successfully', async () => {
      const mockRepoData = {
        full_name: 'test-owner/test-repo',
        stargazers_count: 42,
        forks_count: 7,
        open_issues_count: 3,
        language: 'JavaScript',
        size: 1024,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-12-01T00:00:00Z'
      };

      mockOctokit.rest.repos.get.mockResolvedValue({ data: mockRepoData });

      const result = await getRepoStats('token', 'test-owner', 'test-repo');

      expect(result).toEqual({
        name: 'test-owner/test-repo',
        stars: 42,
        forks: 7,
        issues: 3,
        language: 'JavaScript',
        size: 1024,
        created: '2023-01-01T00:00:00Z',
        updated: '2023-12-01T00:00:00Z'
      });

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo'
      });
    });

    test('should handle API errors gracefully', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('API Error'));

      const result = await getRepoStats('token', 'test-owner', 'test-repo');

      expect(result).toBeNull();
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch repository stats: API Error');
    });
  });

  describe('Action execution with GitHub API', () => {
    test('should fetch repo stats when token is provided', async () => {
      mockCore.getInput.mockImplementation(name => {
        const inputs = {
          'who-to-greet': 'World',
          'message-prefix': 'Hello',
          'github-token': 'test-token'
        };
        return inputs[name] || '';
      });

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('message', 'Hello, World!');

      // Check that GitHub token was detected
      expect(mockCore.info).toHaveBeenCalledWith('GitHub token provided: Yes');
    });

    test('should skip repo stats when no token provided', async () => {
      await run();

      expect(mockOctokit.rest.repos.get).not.toHaveBeenCalled();
      expect(mockCore.setOutput).toHaveBeenCalledWith('message', 'Hello, World!');
      expect(mockCore.setOutput).not.toHaveBeenCalledWith('repo-stats', expect.anything());
    });
  });
});
