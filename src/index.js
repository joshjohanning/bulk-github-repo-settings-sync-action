/**
 * Bulk GitHub Repository Settings Action
 * Update repository settings in bulk for multiple GitHub repositories
 *
 * Local Development & Testing:
 *
 * 1. Set environment variables to simulate GitHub Actions inputs:
 *    export INPUT_GITHUB_TOKEN="ghp_your_token_here"
 *    export INPUT_REPOSITORIES="owner/repo1,owner/repo2"
 *    export INPUT_ALLOW_SQUASH_MERGE="true"
 *    export INPUT_ALLOW_MERGE_COMMIT="false"
 *    export INPUT_ALLOW_REBASE_MERGE="true"
 *    export INPUT_ALLOW_AUTO_MERGE="true"
 *    export INPUT_DELETE_BRANCH_ON_MERGE="true"
 *    export INPUT_ALLOW_UPDATE_BRANCH="true"
 *
 * 2. Run locally:
 *    node src/index.js
 *
 * Example with YAML file:
 *    export INPUT_REPOSITORIES_FILE="repos.yml"
 *    node src/index.js
 *
 * Example with all repos:
 *    export INPUT_REPOSITORIES="all"
 *    export INPUT_OWNER="your-org-or-user"
 *    node src/index.js
 */

import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * Get input value (works reliably in both GitHub Actions and local environments)
 * @param {string} name - Input name (with dashes)
 * @returns {string} Input value
 */
function getInput(name) {
  // Try core.getInput first (works in GitHub Actions)
  let value = core.getInput(name);

  // Fallback: try direct environment variable access (for local development)
  if (!value) {
    const envName = `INPUT_${name.replace(/-/g, '_').toUpperCase()}`;
    value = process.env[envName] || '';
  }

  return value;
}

/**
 * Convert string input to boolean (more permissive than core.getBooleanInput)
 * @param {string} name - Input name
 * @returns {boolean|null} Boolean value or null if not set
 */
function getBooleanInput(name) {
  const input = getInput(name).toLowerCase();
  if (!input) return null;
  return input === 'true' || input === '1' || input === 'yes';
}

/**
 * Parse repository list from various input sources
 * @param {string} repositories - Comma-separated list or "all"
 * @param {string} repositoriesFile - Path to YAML file
 * @param {string} owner - Owner name (for "all" option)
 * @param {Octokit} octokit - Octokit instance
 * @returns {Promise<string[]>} Array of repository names in "owner/repo" format
 */
export async function parseRepositories(repositories, repositoriesFile, owner, octokit) {
  let repoList = [];

  // Parse from YAML file if provided
  if (repositoriesFile) {
    try {
      const fileContent = fs.readFileSync(repositoriesFile, 'utf8');
      const data = yaml.load(fileContent);

      if (Array.isArray(data.repositories)) {
        repoList = data.repositories;
      } else if (Array.isArray(data)) {
        repoList = data;
      } else {
        throw new Error('YAML file must contain a "repositories" array or be an array of repositories');
      }
    } catch (error) {
      throw new Error(`Failed to parse repositories file: ${error.message}`);
    }
  }
  // Get all repositories for owner
  else if (repositories === 'all') {
    if (!owner) {
      throw new Error('Owner must be specified when using "all" for repositories');
    }

    try {
      core.info(`Fetching all repositories for ${owner}...`);
      const repos = [];
      let page = 1;
      let hasMore = true;

      // Try to fetch as organization first, fall back to user if it fails
      let isOrg = false;
      try {
        await octokit.rest.orgs.get({ org: owner });
        isOrg = true;
      } catch {
        // Not an org or no access, treat as user
        isOrg = false;
      }

      while (hasMore) {
        const { data } = isOrg
          ? await octokit.rest.repos.listForOrg({
              org: owner,
              type: 'all',
              per_page: 100,
              page
            })
          : await octokit.rest.repos.listForUser({
              username: owner,
              type: 'all',
              per_page: 100,
              page
            });

        if (data.length === 0) {
          hasMore = false;
        } else {
          repos.push(...data.map(repo => repo.full_name));
          page++;
        }
      }

      repoList = repos;
      core.info(`Found ${repoList.length} repositories`);
    } catch (error) {
      throw new Error(`Failed to fetch repositories for ${owner}: ${error.message}`);
    }
  }
  // Parse from comma-separated list
  else if (repositories) {
    repoList = repositories
      .split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);
  }

  if (repoList.length === 0) {
    throw new Error('No repositories specified. Use repositories, repositories-file, or repositories="all" with owner');
  }

  return repoList;
}

/**
 * Update repository settings
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {Object} settings - Settings to update
 * @param {boolean} enableCodeScanning - Enable default CodeQL scanning
 * @param {Array<string>|null} topics - Topics to set on repository
 * @returns {Promise<Object>} Result object
 */
export async function updateRepositorySettings(octokit, repo, settings, enableCodeScanning, topics) {
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"'
    };
  }

  try {
    const updateParams = {
      owner,
      repo: repoName
    };

    // Only add settings that are explicitly set (not null)
    if (settings.allow_squash_merge !== null) {
      updateParams.allow_squash_merge = settings.allow_squash_merge;
    }
    if (settings.allow_merge_commit !== null) {
      updateParams.allow_merge_commit = settings.allow_merge_commit;
    }
    if (settings.allow_rebase_merge !== null) {
      updateParams.allow_rebase_merge = settings.allow_rebase_merge;
    }
    if (settings.allow_auto_merge !== null) {
      updateParams.allow_auto_merge = settings.allow_auto_merge;
    }
    if (settings.delete_branch_on_merge !== null) {
      updateParams.delete_branch_on_merge = settings.delete_branch_on_merge;
    }
    if (settings.allow_update_branch !== null) {
      updateParams.allow_update_branch = settings.allow_update_branch;
    }

    // Update repository settings
    await octokit.rest.repos.update(updateParams);

    const result = {
      repository: repo,
      success: true,
      settings: updateParams
    };

    // Update topics if provided
    if (topics !== null) {
      try {
        await octokit.rest.repos.replaceAllTopics({
          owner,
          repo: repoName,
          names: topics
        });
        result.topicsUpdated = true;
        result.topics = topics;
      } catch (error) {
        result.topicsWarning = `Could not update topics: ${error.message}`;
      }
    }

    // Enable CodeQL scanning if requested
    if (enableCodeScanning) {
      try {
        await octokit.rest.codeScanning.updateDefaultSetup({
          owner,
          repo: repoName,
          state: 'configured',
          query_suite: 'default'
        });
        result.codeScanningEnabled = true;
      } catch (error) {
        // CodeQL setup might fail for various reasons (not supported language, already enabled, etc.)
        result.codeScanningWarning = `Could not enable CodeQL: ${error.message}`;
      }
    }

    return result;
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: error.message
    };
  }
}

/**
 * Main action logic
 */
export async function run() {
  try {
    // Get inputs
    const githubToken = getInput('github-token');
    const repositories = getInput('repositories');
    const repositoriesFile = getInput('repositories-file');
    const owner = getInput('owner');

    // Get settings inputs
    const settings = {
      allow_squash_merge: getBooleanInput('allow-squash-merge'),
      allow_merge_commit: getBooleanInput('allow-merge-commit'),
      allow_rebase_merge: getBooleanInput('allow-rebase-merge'),
      allow_auto_merge: getBooleanInput('allow-auto-merge'),
      delete_branch_on_merge: getBooleanInput('delete-branch-on-merge'),
      allow_update_branch: getBooleanInput('allow-update-branch')
    };

    const enableCodeScanning = getBooleanInput('enable-code-scanning');

    // Parse topics if provided
    const topicsInput = getInput('topics');
    const topics = topicsInput
      ? topicsInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
      : null;

    core.info('Starting Bulk GitHub Repository Settings Action...');

    if (!githubToken) {
      throw new Error('github-token is required');
    }

    // Check if any settings are specified
    const hasSettings = Object.values(settings).some(value => value !== null) || enableCodeScanning || topics !== null;
    if (!hasSettings) {
      throw new Error(
        'At least one repository setting must be specified (or enable-code-scanning must be true, or topics must be provided)'
      );
    }

    // Initialize Octokit
    const octokit = new Octokit({ auth: githubToken });

    // Parse repository list
    const repoList = await parseRepositories(repositories, repositoriesFile, owner, octokit);

    core.info(`Processing ${repoList.length} repositories...`);
    core.info(`Settings to apply: ${JSON.stringify(settings, null, 2)}`);
    if (enableCodeScanning) {
      core.info('CodeQL scanning will be enabled');
    }
    if (topics !== null) {
      core.info(`Topics to set: ${topics.join(', ')}`);
    }

    // Update repositories
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const repo of repoList) {
      core.info(`Updating ${repo}...`);
      const result = await updateRepositorySettings(octokit, repo, settings, enableCodeScanning, topics);
      results.push(result);

      if (result.success) {
        successCount++;
        core.info(`✅ Successfully updated ${repo}`);
        if (result.topicsUpdated) {
          core.info(`  🏷️  Topics updated: ${result.topics.join(', ')}`);
        }
        if (result.topicsWarning) {
          core.warning(`  ⚠️ ${result.topicsWarning}`);
        }
        if (result.codeScanningEnabled) {
          core.info(`  📊 CodeQL scanning enabled`);
        }
        if (result.codeScanningWarning) {
          core.warning(`  ⚠️ ${result.codeScanningWarning}`);
        }
      } else {
        failureCount++;
        core.warning(`❌ Failed to update ${repo}: ${result.error}`);
      }
    }

    // Set outputs
    core.setOutput('updated-repositories', successCount.toString());
    core.setOutput('failed-repositories', failureCount.toString());
    core.setOutput('results', JSON.stringify(results));

    // Create summary
    const summaryTable = [
      [
        { data: 'Repository', header: true },
        { data: 'Status', header: true },
        { data: 'Details', header: true }
      ],
      ...results.map(r => [r.repository, r.success ? '✅ Success' : '❌ Failed', r.success ? 'Updated' : r.error])
    ];

    try {
      await core.summary
        .addHeading('Bulk Repository Settings Update Results')
        .addRaw(`\n**Total Repositories:** ${repoList.length}`)
        .addRaw(`\n**Successful:** ${successCount}`)
        .addRaw(`\n**Failed:** ${failureCount}\n\n`)
        .addTable(summaryTable)
        .write();
    } catch {
      // Fallback for local development
      core.info('📊 Bulk Repository Settings Update Results:');
      core.info(`Total Repositories: ${repoList.length}`);
      core.info(`Successful: ${successCount}`);
      core.info(`Failed: ${failureCount}`);
      for (const result of results) {
        core.info(
          `  ${result.repository}: ${result.success ? '✅' : '❌'} ${result.success ? 'Updated' : result.error}`
        );
      }
    }

    core.info('✅ Action completed successfully!');

    if (failureCount > 0) {
      core.warning(`${failureCount} repositories failed to update`);
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

// Execute the action (only when run directly, not when imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

// Export as default for testing
export default run;
