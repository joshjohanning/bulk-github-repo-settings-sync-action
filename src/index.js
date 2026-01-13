/**
 * Bulk GitHub Repository Settings Action
 * Update repository settings in bulk for multiple GitHub repositories
 *
 * Local Development & Testing:
 *
 * 1. Set environment variables to simulate GitHub Actions inputs:
 *    export INPUT_GITHUB_TOKEN="ghp_your_token_here"
 *    export INPUT_GITHUB_API_URL="https://api.github.com"  # Optional, defaults to github.api_url
 *    export INPUT_REPOSITORIES="owner/repo1,owner/repo2"
 *    export INPUT_ALLOW_SQUASH_MERGE="true"
 *    export INPUT_ALLOW_MERGE_COMMIT="false"
 *    export INPUT_ALLOW_REBASE_MERGE="true"
 *    export INPUT_ALLOW_AUTO_MERGE="true"
 *    export INPUT_DELETE_BRANCH_ON_MERGE="true"
 *    export INPUT_ALLOW_UPDATE_BRANCH="true"
 *    export INPUT_DEPENDABOT_YML="./path/to/dependabot.yml"
 *    export INPUT_DEPENDABOT_PR_TITLE="chore: update dependabot.yml"
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
import * as path from 'path';
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
 * @returns {Promise<Array>} Array of repository objects with settings
 */
export async function parseRepositories(repositories, repositoriesFile, owner, octokit) {
  let repoList = [];

  // Parse from YAML file if provided
  if (repositoriesFile) {
    try {
      const fileContent = fs.readFileSync(repositoriesFile, 'utf8');
      const data = yaml.load(fileContent);

      // Only support repos array format
      if (Array.isArray(data.repos)) {
        repoList = data.repos.map(item => {
          if (typeof item === 'string') {
            // Simple string format: just repo name
            return { repo: item };
          } else if (typeof item === 'object' && item.repo) {
            // Object format with repo and optional settings
            return item;
          } else {
            throw new Error('Each item in repos array must be a string or object with "repo" property');
          }
        });
      } else {
        throw new Error('YAML file must contain a "repos" array');
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
          repos.push(...data.map(r => ({ repo: r.full_name })));
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
      .filter(r => r.length > 0)
      .map(repo => ({ repo }));
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
 * @param {boolean|null} immutableReleases - Enable or disable immutable releases
 * @param {Array<string>|null} topics - Topics to set on repository
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function updateRepositorySettings(
  octokit,
  repo,
  settings,
  enableCodeScanning,
  immutableReleases,
  topics,
  dryRun
) {
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"'
    };
  }

  try {
    // Fetch current repository settings to show what's changing
    let currentRepo;
    try {
      const response = await octokit.rest.repos.get({
        owner,
        repo: repoName
      });
      currentRepo = response.data;
    } catch (error) {
      // Handle 403 (Forbidden) - likely means the app doesn't have access
      if (error.status === 403) {
        core.warning(
          `Access denied to repository ${repo}. The GitHub App or token does not have permission to access this repository. Skipping.`
        );
        return {
          repository: repo,
          success: false,
          error: 'Access denied - GitHub App or token does not have permission to access this repository',
          accessDenied: true,
          dryRun
        };
      }
      // Re-throw other errors
      throw error;
    }

    // Check if we have insufficient permissions
    // The 'permissions' object should always be present. If it's missing, we don't have any access.
    if (!currentRepo.permissions) {
      core.warning(
        `Insufficient permissions for repository ${repo}. GitHub App may not be installed or does not have sufficient access. Skipping.`
      );
      return {
        repository: repo,
        success: false,
        error: 'Insufficient permissions - GitHub App may not be installed or does not have any access',
        insufficientPermissions: true,
        dryRun
      };
    }

    // Check if we can read the repository settings
    // If allow_squash_merge is undefined, it means we can't read the settings (likely not installed on repo)
    // Check for multiple critical settings fields to robustly determine if settings are readable
    const settingsFields = [
      'allow_squash_merge',
      'allow_merge_commit',
      'allow_rebase_merge',
      'delete_branch_on_merge',
      'allow_auto_merge',
      'allow_update_branch'
    ];
    const allSettingsUndefined = settingsFields.every(field => currentRepo[field] === undefined);
    if (allSettingsUndefined) {
      core.warning(
        `Cannot read repository settings for ${repo}. GitHub App may not be installed on this repository. Skipping.`
      );
      return {
        repository: repo,
        success: false,
        error:
          'Cannot read repository settings - GitHub App may not be installed on this repository or does not have sufficient access',
        insufficientPermissions: true,
        dryRun
      };
    }

    const updateParams = {
      owner,
      repo: repoName
    };

    const changes = [];
    const currentSettings = {};

    // Only add settings that are explicitly set (not null) and track changes
    if (settings.allow_squash_merge !== null) {
      updateParams.allow_squash_merge = settings.allow_squash_merge;
      currentSettings.allow_squash_merge = currentRepo.allow_squash_merge;
      if (currentRepo.allow_squash_merge !== settings.allow_squash_merge) {
        changes.push({
          setting: 'allow_squash_merge',
          from: currentRepo.allow_squash_merge,
          to: settings.allow_squash_merge
        });
      }
    }
    if (settings.allow_merge_commit !== null) {
      updateParams.allow_merge_commit = settings.allow_merge_commit;
      currentSettings.allow_merge_commit = currentRepo.allow_merge_commit;
      if (currentRepo.allow_merge_commit !== settings.allow_merge_commit) {
        changes.push({
          setting: 'allow_merge_commit',
          from: currentRepo.allow_merge_commit,
          to: settings.allow_merge_commit
        });
      }
    }
    if (settings.allow_rebase_merge !== null) {
      updateParams.allow_rebase_merge = settings.allow_rebase_merge;
      currentSettings.allow_rebase_merge = currentRepo.allow_rebase_merge;
      if (currentRepo.allow_rebase_merge !== settings.allow_rebase_merge) {
        changes.push({
          setting: 'allow_rebase_merge',
          from: currentRepo.allow_rebase_merge,
          to: settings.allow_rebase_merge
        });
      }
    }
    if (settings.allow_auto_merge !== null) {
      updateParams.allow_auto_merge = settings.allow_auto_merge;
      currentSettings.allow_auto_merge = currentRepo.allow_auto_merge;
      if (currentRepo.allow_auto_merge !== settings.allow_auto_merge) {
        changes.push({
          setting: 'allow_auto_merge',
          from: currentRepo.allow_auto_merge,
          to: settings.allow_auto_merge
        });
      }
    }
    if (settings.delete_branch_on_merge !== null) {
      updateParams.delete_branch_on_merge = settings.delete_branch_on_merge;
      currentSettings.delete_branch_on_merge = currentRepo.delete_branch_on_merge;
      if (currentRepo.delete_branch_on_merge !== settings.delete_branch_on_merge) {
        changes.push({
          setting: 'delete_branch_on_merge',
          from: currentRepo.delete_branch_on_merge,
          to: settings.delete_branch_on_merge
        });
      }
    }
    if (settings.allow_update_branch !== null) {
      updateParams.allow_update_branch = settings.allow_update_branch;
      currentSettings.allow_update_branch = currentRepo.allow_update_branch;
      if (currentRepo.allow_update_branch !== settings.allow_update_branch) {
        changes.push({
          setting: 'allow_update_branch',
          from: currentRepo.allow_update_branch,
          to: settings.allow_update_branch
        });
      }
    }

    const result = {
      repository: repo,
      success: true,
      settings: updateParams,
      currentSettings,
      changes,
      dryRun
    };

    // Update repository settings (skip in dry-run mode)
    if (!dryRun && changes.length > 0) {
      await octokit.rest.repos.update(updateParams);
    }

    // Handle topics
    if (topics !== null) {
      try {
        // Fetch current topics
        const { data: topicsData } = await octokit.rest.repos.getAllTopics({
          owner,
          repo: repoName
        });
        const currentTopics = topicsData.names || [];
        result.currentTopics = currentTopics;

        // Check if topics are different (order-independent comparison)
        const currentTopicsSet = new Set(currentTopics);
        const newTopicsSet = new Set(topics);

        const topicsToAdd = topics.filter(topic => !currentTopicsSet.has(topic));
        const topicsToRemove = currentTopics.filter(topic => !newTopicsSet.has(topic));

        const topicsChanged = topicsToAdd.length > 0 || topicsToRemove.length > 0;

        if (topicsChanged) {
          result.topicsChange = {
            from: currentTopics,
            to: topics,
            added: topicsToAdd,
            removed: topicsToRemove
          };

          if (!dryRun) {
            await octokit.rest.repos.replaceAllTopics({
              owner,
              repo: repoName,
              names: topics
            });
            result.topicsUpdated = true;
          } else {
            result.topicsWouldUpdate = true;
          }
        } else {
          result.topicsUnchanged = true;
        }
        result.topics = topics;
      } catch (error) {
        result.topicsWarning = `Could not process topics: ${error.message}`;
      }
    }

    // Handle CodeQL scanning
    if (enableCodeScanning) {
      try {
        // Try to get current code scanning setup
        let currentCodeScanning = null;
        try {
          const { data: codeScanningData } = await octokit.rest.codeScanning.getDefaultSetup({
            owner,
            repo: repoName
          });
          currentCodeScanning = codeScanningData.state;
        } catch {
          // Default setup might not exist yet
          currentCodeScanning = 'not-configured';
        }

        result.currentCodeScanning = currentCodeScanning;

        if (currentCodeScanning !== 'configured') {
          result.codeScanningChange = {
            from: currentCodeScanning,
            to: 'configured'
          };

          if (!dryRun) {
            await octokit.rest.codeScanning.updateDefaultSetup({
              owner,
              repo: repoName,
              state: 'configured',
              query_suite: 'default'
            });
            result.codeScanningEnabled = true;
          } else {
            result.codeScanningWouldEnable = true;
          }
        } else {
          result.codeScanningUnchanged = true;
        }
      } catch (error) {
        // CodeQL setup might fail for various reasons (not supported language, already enabled, etc.)
        result.codeScanningWarning = `Could not process CodeQL: ${error.message}`;
      }
    }

    // Handle immutable releases
    if (immutableReleases !== null) {
      try {
        // Check current immutable releases status
        let currentImmutableReleases = false;
        try {
          const response = await octokit.request('GET /repos/{owner}/{repo}/immutable-releases', {
            owner,
            repo: repoName,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
          // Check the 'enabled' property in the response
          currentImmutableReleases = response.data.enabled === true;
        } catch (error) {
          // 404 means immutable releases are not enabled
          if (error.status === 404) {
            currentImmutableReleases = false;
          } else {
            throw error;
          }
        }

        result.currentImmutableReleases = currentImmutableReleases;

        if (currentImmutableReleases !== immutableReleases) {
          result.immutableReleasesChange = {
            from: currentImmutableReleases,
            to: immutableReleases
          };

          if (!dryRun) {
            if (immutableReleases) {
              // Enable immutable releases
              await octokit.request('PUT /repos/{owner}/{repo}/immutable-releases', {
                owner,
                repo: repoName,
                headers: {
                  'X-GitHub-Api-Version': '2022-11-28'
                }
              });
            } else {
              // Disable immutable releases
              await octokit.request('DELETE /repos/{owner}/{repo}/immutable-releases', {
                owner,
                repo: repoName,
                headers: {
                  'X-GitHub-Api-Version': '2022-11-28'
                }
              });
            }
            result.immutableReleasesUpdated = true;
          } else {
            result.immutableReleasesWouldUpdate = true;
          }
        } else {
          result.immutableReleasesUnchanged = true;
        }
      } catch (error) {
        // Immutable releases might fail for various reasons (insufficient permissions, not available, etc.)
        result.immutableReleasesWarning = `Could not process immutable releases: ${error.message}`;
      }
    }

    return result;
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: error.message,
      dryRun
    };
  }
}

/**
 * Generic function to sync one or more files to a target repository via pull request.
 * If an open PR already exists for the same branch, returns early with 'pr-exists' status
 * to avoid creating duplicate PRs. The existing PR is not updated with new file changes.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {Object} options - Sync options
 * @param {Array<{sourceFilePath: string, targetPath: string}>} options.files - Array of file mappings (sourceFilePath -> targetPath)
 * @param {string} options.branchName - Branch name for the PR
 * @param {string} options.prTitle - Title for the pull request
 * @param {string} options.prBodyCreate - PR body when creating new file(s)
 * @param {string} options.prBodyUpdate - PR body when updating existing file(s)
 * @param {string} options.resultKey - Key for the result status (e.g., 'dependabotYml', 'pullRequestTemplate', 'workflowFiles')
 * @param {string} options.fileDescription - Human-readable description of the file(s) (for error messages)
 * @param {Object} [options.contentProcessor] - Optional processor for custom content handling (e.g., preserving repo-specific sections)
 * @param {Function} [options.contentProcessor.getComparableExisting] - (existingContent) => content to compare against source
 * @param {Function} [options.contentProcessor.getFinalContent] - (sourceContent, existingContent) => content to commit
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncFilesViaPullRequest(octokit, repo, options, dryRun) {
  const { files, branchName, prTitle, prBodyCreate, prBodyUpdate, resultKey, fileDescription, contentProcessor } =
    options;

  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  try {
    // Read all source files and build file info array
    const fileInfos = [];
    for (const file of files) {
      let sourceContent;
      try {
        sourceContent = fs.readFileSync(file.sourceFilePath, 'utf8');
      } catch (error) {
        return {
          repository: repo,
          success: false,
          error: `Failed to read file at ${file.sourceFilePath} for ${fileDescription}: ${error.message}`,
          dryRun
        };
      }
      fileInfos.push({
        sourceFilePath: file.sourceFilePath,
        targetPath: file.targetPath,
        content: sourceContent
      });
    }

    // Get default branch
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo: repoName
    });
    const defaultBranch = repoData.default_branch;

    // Check each file and determine which need updates
    const filesToUpdate = [];
    for (const fileInfo of fileInfos) {
      let existingSha = null;
      let existingContent = null;

      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo: repoName,
          path: fileInfo.targetPath,
          ref: defaultBranch
        });
        existingSha = data.sha;
        existingContent = Buffer.from(data.content, 'base64').toString('utf8');
      } catch (error) {
        if (error.status === 404) {
          // File doesn't exist - this is fine, we'll create it
          core.info(`  📄 ${fileInfo.targetPath} does not exist in ${repo}, will create it`);
        } else {
          throw error;
        }
      }

      // Compare content - use contentProcessor if provided to handle special cases like repo-specific sections
      let comparableExisting = existingContent;
      let finalContent = fileInfo.content;

      if (contentProcessor && existingContent) {
        // Get the comparable portion of existing content (e.g., strip repo-specific sections)
        comparableExisting = contentProcessor.getComparableExisting(existingContent);
        // Get the final content to commit (e.g., merge source with repo-specific sections)
        finalContent = contentProcessor.getFinalContent(fileInfo.content, existingContent);
      }

      const needsUpdate = !existingContent || comparableExisting.trim() !== fileInfo.content.trim();

      if (needsUpdate) {
        filesToUpdate.push({
          ...fileInfo,
          existingSha,
          existingContent,
          finalContent,
          isNew: !existingContent
        });
      }
    }

    // If no files need updates, return early
    if (filesToUpdate.length === 0) {
      const targetPaths = fileInfos.map(f => f.targetPath);
      const message =
        fileInfos.length === 1 ? `${targetPaths[0]} is already up to date` : 'All files are already up to date';
      return {
        repository: repo,
        success: true,
        [resultKey]: 'unchanged',
        message,
        filesProcessed: targetPaths,
        dryRun
      };
    }

    // Check if there's already an open PR for this update
    let existingPR = null;
    try {
      const { data: pulls } = await octokit.rest.pulls.list({
        owner,
        repo: repoName,
        state: 'open',
        head: `${owner}:${branchName}`
      });

      if (pulls.length > 0) {
        existingPR = pulls[0];
        const targetDesc = fileInfos.length === 1 ? fileInfos[0].targetPath : fileDescription;
        core.info(`  🔄 Found existing open PR #${existingPR.number} for ${targetDesc}`);
      }
    } catch (error) {
      // Non-fatal, continue
      core.warning(`  ⚠️  Could not check for existing PRs: ${error.message}`);
    }

    // If there's already an open PR, don't create/update another one
    if (existingPR) {
      const targetDesc = fileInfos.length === 1 ? fileInfos[0].targetPath : fileDescription;
      return {
        repository: repo,
        success: true,
        [resultKey]: 'pr-exists',
        message: `Open PR #${existingPR.number} already exists for ${targetDesc}`,
        prNumber: existingPR.number,
        prUrl: existingPR.html_url,
        filesProcessed: fileInfos.map(f => f.targetPath),
        dryRun
      };
    }

    if (dryRun) {
      const newFiles = filesToUpdate.filter(f => f.isNew).map(f => f.targetPath);
      const updatedFiles = filesToUpdate.filter(f => !f.isNew).map(f => f.targetPath);
      let message;
      if (fileInfos.length === 1) {
        message = filesToUpdate[0].isNew
          ? `Would create ${filesToUpdate[0].targetPath} via PR`
          : `Would update ${filesToUpdate[0].targetPath} via PR`;
      } else {
        message = `Would sync ${filesToUpdate.length} file(s) via PR`;
      }
      return {
        repository: repo,
        success: true,
        [resultKey]: filesToUpdate.some(f => f.isNew) ? 'would-create' : 'would-update',
        message,
        filesWouldCreate: newFiles.length > 0 ? newFiles : undefined,
        filesWouldUpdate: updatedFiles.length > 0 ? updatedFiles : undefined,
        filesProcessed: fileInfos.map(f => f.targetPath),
        dryRun
      };
    }

    // Create or get reference to the branch
    core.info(`  🔍 Checking for existing branch ${branchName}...`);
    let branchExists = false;
    try {
      await octokit.rest.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${branchName}`
      });
      branchExists = true;
      core.info(`  ✓ Branch ${branchName} exists`);
    } catch (error) {
      if (error.status === 404) {
        core.info(`  ✓ Branch ${branchName} does not exist`);
      } else {
        throw error;
      }
    }

    // Get the SHA of the default branch to create new branch from
    const { data: defaultRef } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`
    });

    if (!branchExists) {
      // Create new branch
      await octokit.rest.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${branchName}`,
        sha: defaultRef.object.sha
      });
      core.info(`  🌿 Created branch ${branchName}`);
    } else {
      // Update existing branch to latest from default branch
      await octokit.rest.git.updateRef({
        owner,
        repo: repoName,
        ref: `heads/${branchName}`,
        sha: defaultRef.object.sha,
        force: true
      });
      core.info(`  🌿 Updated branch ${branchName}`);
    }

    // Create or update each file
    const createdFiles = [];
    const updatedFiles = [];

    for (const file of filesToUpdate) {
      const commitMessage = file.isNew ? `chore: add ${file.targetPath}` : `chore: update ${file.targetPath}`;

      // Use finalContent if available (from contentProcessor), otherwise use original content
      const contentToCommit = file.finalContent || file.content;

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: file.targetPath,
        message: commitMessage,
        content: Buffer.from(contentToCommit).toString('base64'),
        branch: branchName,
        sha: file.existingSha || undefined
      });

      if (file.isNew) {
        createdFiles.push(file.targetPath);
      } else {
        updatedFiles.push(file.targetPath);
      }

      core.info(`  ✍️  Committed changes to ${file.targetPath}`);
    }

    // Prepare PR body content - use dynamic body for multiple files, or simple body for single file
    let prBody;
    if (fileInfos.length === 1) {
      prBody = filesToUpdate[0].isNew ? prBodyCreate : prBodyUpdate;
    } else {
      prBody = `This PR syncs ${fileDescription} to the latest versions.\n\n**Changes:**\n`;
      if (createdFiles.length > 0) {
        prBody += `\n**Added:**\n${createdFiles.map(f => `- \`${f}\``).join('\n')}\n`;
      }
      if (updatedFiles.length > 0) {
        prBody += `\n**Updated:**\n${updatedFiles.map(f => `- \`${f}\``).join('\n')}\n`;
      }
    }

    // Create new PR (we only reach here if no existing PR was found)
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: prTitle,
      head: branchName,
      base: defaultBranch,
      body: prBody
    });
    const prNumber = pr.number;
    core.info(`  📬 Created PR #${prNumber}: ${pr.html_url}`);

    // Determine status
    let status;
    if (createdFiles.length > 0 && updatedFiles.length > 0) {
      status = 'mixed';
    } else if (createdFiles.length > 0) {
      status = 'created';
    } else {
      status = 'updated';
    }

    // Build message
    let message;
    if (fileInfos.length === 1) {
      message = filesToUpdate[0].isNew
        ? `Created ${filesToUpdate[0].targetPath} via PR #${prNumber}`
        : `Updated ${filesToUpdate[0].targetPath} via PR #${prNumber}`;
    } else {
      message = `Synced ${filesToUpdate.length} file(s) via PR #${prNumber}`;
    }

    return {
      repository: repo,
      success: true,
      [resultKey]: status,
      prNumber,
      prUrl: `https://github.com/${owner}/${repoName}/pull/${prNumber}`,
      message,
      filesCreated: createdFiles.length > 0 ? createdFiles : undefined,
      filesUpdated: updatedFiles.length > 0 ? updatedFiles : undefined,
      filesProcessed: fileInfos.map(f => f.targetPath),
      dryRun
    };
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync ${fileDescription}: ${error.message}`,
      dryRun
    };
  }
}

/**
 * Legacy wrapper - sync a single file to a target repository via pull request
 * @deprecated Use syncFilesViaPullRequest instead
 */
export async function syncFileViaPullRequest(octokit, repo, options, dryRun) {
  const { sourceFilePath, targetPath, ...restOptions } = options;
  return syncFilesViaPullRequest(
    octokit,
    repo,
    {
      ...restOptions,
      files: [{ sourceFilePath, targetPath }]
    },
    dryRun
  );
}

/**
 * Sync dependabot.yml file to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} dependabotYmlPath - Path to local dependabot.yml file
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncDependabotYml(octokit, repo, dependabotYmlPath, prTitle, dryRun) {
  return syncFileViaPullRequest(
    octokit,
    repo,
    {
      sourceFilePath: dependabotYmlPath,
      targetPath: '.github/dependabot.yml',
      branchName: 'dependabot-yml-sync',
      prTitle,
      prBodyCreate: `This PR adds \`.github/dependabot.yml\` to enable Dependabot.\n\n**Changes:**\n- Added dependabot configuration`,
      prBodyUpdate: `This PR updates \`.github/dependabot.yml\` to the latest version.\n\n**Changes:**\n- Updated dependabot configuration`,
      resultKey: 'dependabotYml',
      fileDescription: 'dependabot.yml'
    },
    dryRun
  );
}

/**
 * Content processor for .gitignore files that preserves repository-specific entries.
 * Repository-specific entries are marked with a special comment marker and are
 * preserved when syncing the base gitignore content.
 */
const gitignoreContentProcessor = {
  marker: '# Repository-specific entries (preserved during sync)',

  /**
   * Get the comparable portion of existing content (everything before the marker)
   * @param {string} existingContent - The existing file content
   * @returns {string} Content to compare against source
   */
  getComparableExisting(existingContent) {
    const markerIndex = existingContent.indexOf(this.marker);
    if (markerIndex === -1) {
      return existingContent;
    }
    return existingContent.substring(0, markerIndex).trimEnd();
  },

  /**
   * Get the final content to commit (source + preserved repo-specific entries)
   * @param {string} sourceContent - The source file content
   * @param {string} existingContent - The existing file content
   * @returns {string} Final content to commit
   */
  getFinalContent(sourceContent, existingContent) {
    const markerIndex = existingContent.indexOf(this.marker);
    if (markerIndex === -1) {
      // No repo-specific content, just use source
      let finalContent = sourceContent.trim();
      if (!finalContent.endsWith('\n')) {
        finalContent += '\n';
      }
      return finalContent;
    }

    // Extract and preserve repo-specific content
    const repoSpecificContent = existingContent.substring(markerIndex);
    let finalContent = sourceContent.trim();

    // Ensure there's a blank line before the repo-specific section
    if (!finalContent.endsWith('\n')) {
      finalContent += '\n';
    }
    if (!finalContent.endsWith('\n\n')) {
      finalContent += '\n';
    }
    finalContent += repoSpecificContent;

    // Ensure file ends with a newline
    if (!finalContent.endsWith('\n')) {
      finalContent += '\n';
    }

    return finalContent;
  }
};

/**
 * Sync .gitignore file to target repository
 * This function handles .gitignore specially to preserve repository-specific entries
 * that are marked with a special comment marker.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} gitignorePath - Path to local .gitignore file
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncGitignore(octokit, repo, gitignorePath, prTitle, dryRun) {
  return syncFileViaPullRequest(
    octokit,
    repo,
    {
      sourceFilePath: gitignorePath,
      targetPath: '.gitignore',
      branchName: 'gitignore-sync',
      prTitle,
      prBodyCreate: `This PR adds \`.gitignore\` to the repository.\n\n**Changes:**\n- Added .gitignore configuration`,
      prBodyUpdate: `This PR updates \`.gitignore\` to the latest version.\n\n**Changes:**\n- Updated .gitignore configuration\n- Repository-specific entries have been preserved`,
      resultKey: 'gitignore',
      fileDescription: '.gitignore',
      contentProcessor: gitignoreContentProcessor
    },
    dryRun
  );
}

/**
 * Deep comparison of objects for package.json fields
 * @param {*} obj1 - First object to compare
 * @param {*} obj2 - Second object to compare
 * @returns {boolean} True if objects are equal
 */
function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (obj1 === null || obj2 === null) return obj1 === obj2;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();

  if (keys1.length !== keys2.length) return false;
  if (keys1.join(',') !== keys2.join(',')) return false;

  return keys1.every(key => deepEqual(obj1[key], obj2[key]));
}

/**
 * Sync package.json fields (scripts and/or engines) to target repository via PR
 * This function merges selected fields from a source package.json into the target,
 * preserving all other fields in the target package.json.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} packageJsonPath - Path to local package.json file
 * @param {boolean} syncScripts - Whether to sync the scripts field
 * @param {boolean} syncEngines - Whether to sync the engines field
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncPackageJson(octokit, repo, packageJsonPath, syncScripts, syncEngines, prTitle, dryRun) {
  const [owner, repoName] = repo.split('/');
  const targetPath = 'package.json';
  const branchName = 'package-json-sync';

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  if (!syncScripts && !syncEngines) {
    return {
      repository: repo,
      success: false,
      error: 'At least one of syncScripts or syncEngines must be enabled',
      dryRun
    };
  }

  try {
    // Read and parse the source package.json file
    let sourcePackageJson;
    try {
      const sourceContent = fs.readFileSync(packageJsonPath, 'utf8');
      sourcePackageJson = JSON.parse(sourceContent);
    } catch (error) {
      return {
        repository: repo,
        success: false,
        error: `Failed to read or parse package.json file at ${packageJsonPath}: ${error.message}`,
        dryRun
      };
    }

    // Get default branch
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo: repoName
    });
    const defaultBranch = repoData.default_branch;

    // Check if package.json exists in the target repo
    let existingPackageJson = null;
    let existingSha = null;

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: targetPath,
        ref: defaultBranch
      });
      existingSha = data.sha;
      const existingContent = Buffer.from(data.content, 'base64').toString('utf8');
      existingPackageJson = JSON.parse(existingContent);
    } catch (error) {
      if (error.status === 404) {
        return {
          repository: repo,
          success: false,
          error: `${targetPath} does not exist in ${repo}. This action only updates existing package.json files.`,
          dryRun
        };
      }
      throw error;
    }

    // Build updated package.json by merging selected fields
    const updatedPackageJson = { ...existingPackageJson };
    const changes = [];

    // Check and update scripts if enabled
    if (syncScripts) {
      const sourceScripts = sourcePackageJson.scripts || {};
      const existingScripts = existingPackageJson.scripts || {};

      if (!deepEqual(sourceScripts, existingScripts)) {
        updatedPackageJson.scripts = sourceScripts;
        changes.push({
          field: 'scripts',
          from: Object.keys(existingScripts).length,
          to: Object.keys(sourceScripts).length
        });
      }
    }

    // Check and update engines if enabled
    if (syncEngines) {
      const sourceEngines = sourcePackageJson.engines || {};
      const existingEngines = existingPackageJson.engines || {};

      if (!deepEqual(sourceEngines, existingEngines)) {
        updatedPackageJson.engines = sourceEngines;
        changes.push({
          field: 'engines',
          from: JSON.stringify(existingEngines),
          to: JSON.stringify(sourceEngines)
        });
      }
    }

    // If no changes needed, return early
    if (changes.length === 0) {
      return {
        repository: repo,
        success: true,
        packageJson: 'unchanged',
        message: `${targetPath} is already up to date`,
        dryRun
      };
    }

    // Check if there's already an open PR for this update
    let existingPR = null;
    try {
      const { data: pulls } = await octokit.rest.pulls.list({
        owner,
        repo: repoName,
        state: 'open',
        head: `${owner}:${branchName}`
      });

      if (pulls.length > 0) {
        existingPR = pulls[0];
        core.info(`  🔄 Found existing open PR #${existingPR.number} for ${targetPath}`);
      }
    } catch (error) {
      core.warning(`  ⚠️  Could not check for existing PRs: ${error.message}`);
    }

    if (existingPR) {
      return {
        repository: repo,
        success: true,
        packageJson: 'pr-exists',
        message: `Open PR #${existingPR.number} already exists for ${targetPath}`,
        prNumber: existingPR.number,
        prUrl: existingPR.html_url,
        changes,
        dryRun
      };
    }

    if (dryRun) {
      return {
        repository: repo,
        success: true,
        packageJson: 'would-update',
        message: `Would update ${targetPath} via PR`,
        changes,
        dryRun
      };
    }

    // Create or update the branch
    let branchExists = false;
    try {
      await octokit.rest.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${branchName}`
      });
      branchExists = true;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    const { data: defaultRef } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`
    });

    if (!branchExists) {
      await octokit.rest.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${branchName}`,
        sha: defaultRef.object.sha
      });
      core.info(`  🌿 Created branch ${branchName}`);
    } else {
      await octokit.rest.git.updateRef({
        owner,
        repo: repoName,
        ref: `heads/${branchName}`,
        sha: defaultRef.object.sha,
        force: true
      });
      core.info(`  🌿 Updated branch ${branchName}`);
    }

    // Commit the updated package.json
    const newContent = `${JSON.stringify(updatedPackageJson, null, 2)}\n`;
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: targetPath,
      message: `chore: update ${targetPath}`,
      content: Buffer.from(newContent).toString('base64'),
      branch: branchName,
      sha: existingSha
    });
    core.info(`  ✍️  Committed changes to ${targetPath}`);

    // Build PR body
    let prBody = `This PR updates \`package.json\` with synchronized configuration.\n\n**Changes:**\n`;
    for (const change of changes) {
      prBody += `- Updated \`${change.field}\` (${change.from} → ${change.to} entries)\n`;
    }

    // Create PR
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title: prTitle,
      head: branchName,
      base: defaultBranch,
      body: prBody
    });
    core.info(`  📬 Created PR #${pr.number}: ${pr.html_url}`);

    return {
      repository: repo,
      success: true,
      packageJson: 'updated',
      prNumber: pr.number,
      prUrl: pr.html_url,
      message: `Updated ${targetPath} via PR #${pr.number}`,
      changes,
      dryRun
    };
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync package.json: ${error.message}`,
      dryRun
    };
  }
}

/**
 * Delete rulesets that are not in the managed list
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repoName - Repository name
 * @param {Array} existingRulesets - List of existing rulesets in the repository
 * @param {string} managedRulesetName - Name of the ruleset being managed (to exclude from deletion)
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Array>} Array of deletion results
 */
async function deleteUnmanagedRulesetsHelper(octokit, owner, repoName, existingRulesets, managedRulesetName, dryRun) {
  const rulesetsToDelete = existingRulesets.filter(r => r.name !== managedRulesetName);
  const deletedRulesets = [];

  for (const rulesetToDelete of rulesetsToDelete) {
    if (dryRun) {
      core.info(`  🗑️  Would delete ruleset "${rulesetToDelete.name}" (ID: ${rulesetToDelete.id})`);
      deletedRulesets.push({
        name: rulesetToDelete.name,
        id: rulesetToDelete.id,
        deleted: false,
        wouldDelete: true
      });
    } else {
      try {
        await octokit.rest.repos.deleteRepoRuleset({
          owner,
          repo: repoName,
          ruleset_id: rulesetToDelete.id
        });
        core.info(`  🗑️  Deleted ruleset "${rulesetToDelete.name}" (ID: ${rulesetToDelete.id})`);
        deletedRulesets.push({
          name: rulesetToDelete.name,
          id: rulesetToDelete.id,
          deleted: true
        });
      } catch (deleteError) {
        core.warning(
          `  ⚠️  Failed to delete ruleset "${rulesetToDelete.name}" (ID: ${rulesetToDelete.id}): ${deleteError.message}`
        );
        deletedRulesets.push({
          name: rulesetToDelete.name,
          id: rulesetToDelete.id,
          deleted: false,
          error: deleteError.message
        });
      }
    }
  }

  return deletedRulesets;
}

/**
 * Sync repository ruleset to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} rulesetFilePath - Path to local ruleset JSON file
 * @param {boolean} deleteUnmanaged - Delete all other rulesets besides the one being synced
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncRepositoryRuleset(octokit, repo, rulesetFilePath, deleteUnmanaged, dryRun) {
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  try {
    // Read the source ruleset JSON file
    let rulesetConfig;
    try {
      const fileContent = fs.readFileSync(rulesetFilePath, 'utf8');
      rulesetConfig = JSON.parse(fileContent);
    } catch (error) {
      return {
        repository: repo,
        success: false,
        error: `Failed to read or parse ruleset file at ${rulesetFilePath}: ${error.message}`,
        dryRun
      };
    }

    // Validate that the ruleset has a name
    if (!rulesetConfig.name) {
      return {
        repository: repo,
        success: false,
        error: 'Ruleset configuration must include a "name" field.',
        dryRun
      };
    }

    const rulesetName = rulesetConfig.name;

    // Get existing rulesets for the repository
    let existingRulesets = [];
    try {
      const { data } = await octokit.rest.repos.getRepoRulesets({
        owner,
        repo: repoName
      });
      existingRulesets = data;
    } catch (error) {
      // If we get a 404, the repository might not have rulesets enabled
      if (error.status === 404) {
        core.info(`  📋 Repository ${repo} does not have rulesets enabled or accessible`);
      } else {
        throw error;
      }
    }

    // Check if a ruleset with the same name already exists
    const existingRuleset = existingRulesets.find(r => r.name === rulesetName);

    if (existingRuleset) {
      // Fetch full ruleset details to compare
      const { data: fullRuleset } = await octokit.rest.repos.getRepoRuleset({
        owner,
        repo: repoName,
        ruleset_id: existingRuleset.id
      });

      // Compare the existing ruleset with the new configuration
      // Remove fields that are returned by the API but not part of the input config
      const existingConfig = {
        name: fullRuleset.name,
        target: fullRuleset.target,
        enforcement: fullRuleset.enforcement,
        ...(fullRuleset.bypass_actors && { bypass_actors: fullRuleset.bypass_actors }),
        ...(fullRuleset.conditions && { conditions: fullRuleset.conditions }),
        rules: fullRuleset.rules
      };

      // Normalize the source config by removing API-only fields that shouldn't be compared
      // This allows users to use raw API response JSON as their source config
      const normalizedSourceConfig = {
        name: rulesetConfig.name,
        target: rulesetConfig.target,
        enforcement: rulesetConfig.enforcement,
        ...(rulesetConfig.bypass_actors && { bypass_actors: rulesetConfig.bypass_actors }),
        ...(rulesetConfig.conditions && { conditions: rulesetConfig.conditions }),
        rules: rulesetConfig.rules
      };

      // Deep comparison of the configurations
      const configsMatch = JSON.stringify(existingConfig) === JSON.stringify(normalizedSourceConfig);

      if (configsMatch) {
        core.info(`  📋 Ruleset "${rulesetName}" is already up to date`);

        const result = {
          repository: repo,
          success: true,
          ruleset: 'unchanged',
          rulesetId: existingRuleset.id,
          message: `Ruleset "${rulesetName}" is already up to date`,
          dryRun
        };

        // Handle delete unmanaged rulesets
        if (deleteUnmanaged) {
          const deletedRulesets = await deleteUnmanagedRulesetsHelper(
            octokit,
            owner,
            repoName,
            existingRulesets,
            rulesetName,
            dryRun
          );
          if (deletedRulesets.length > 0) {
            result.deletedRulesets = deletedRulesets;
          }
        }

        return result;
      }

      if (dryRun) {
        const result = {
          repository: repo,
          success: true,
          ruleset: 'would-update',
          rulesetId: existingRuleset.id,
          message: `Would update ruleset "${rulesetName}" (ID: ${existingRuleset.id})`,
          dryRun
        };

        // Handle delete unmanaged rulesets in dry-run mode
        if (deleteUnmanaged) {
          const deletedRulesets = await deleteUnmanagedRulesetsHelper(
            octokit,
            owner,
            repoName,
            existingRulesets,
            rulesetName,
            dryRun
          );
          if (deletedRulesets.length > 0) {
            result.deletedRulesets = deletedRulesets;
          }
        }

        return result;
      }

      // Update existing ruleset
      await octokit.rest.repos.updateRepoRuleset({
        owner,
        repo: repoName,
        ruleset_id: existingRuleset.id,
        ...rulesetConfig
      });

      core.info(`  📋 Updated ruleset "${rulesetName}" (ID: ${existingRuleset.id})`);

      const result = {
        repository: repo,
        success: true,
        ruleset: 'updated',
        rulesetId: existingRuleset.id,
        message: `Updated ruleset "${rulesetName}" (ID: ${existingRuleset.id})`,
        dryRun
      };

      // Handle delete unmanaged rulesets
      if (deleteUnmanaged) {
        const deletedRulesets = await deleteUnmanagedRulesetsHelper(
          octokit,
          owner,
          repoName,
          existingRulesets,
          rulesetName,
          dryRun
        );
        if (deletedRulesets.length > 0) {
          result.deletedRulesets = deletedRulesets;
        }
      }

      return result;
    }

    if (dryRun) {
      const result = {
        repository: repo,
        success: true,
        ruleset: 'would-create',
        message: `Would create ruleset "${rulesetName}"`,
        dryRun
      };

      // Handle delete unmanaged rulesets in dry-run mode
      if (deleteUnmanaged) {
        const deletedRulesets = await deleteUnmanagedRulesetsHelper(
          octokit,
          owner,
          repoName,
          existingRulesets,
          rulesetName,
          dryRun
        );
        if (deletedRulesets.length > 0) {
          result.deletedRulesets = deletedRulesets;
        }
      }

      return result;
    }

    // Create new ruleset
    const { data: newRuleset } = await octokit.rest.repos.createRepoRuleset({
      owner,
      repo: repoName,
      ...rulesetConfig
    });

    core.info(`  📋 Created ruleset "${rulesetName}" (ID: ${newRuleset.id})`);

    const result = {
      repository: repo,
      success: true,
      ruleset: 'created',
      rulesetId: newRuleset.id,
      message: `Created ruleset "${rulesetName}" (ID: ${newRuleset.id})`,
      dryRun
    };

    // Handle delete unmanaged rulesets
    if (deleteUnmanaged) {
      const deletedRulesets = await deleteUnmanagedRulesetsHelper(
        octokit,
        owner,
        repoName,
        existingRulesets,
        rulesetName,
        dryRun
      );
      if (deletedRulesets.length > 0) {
        result.deletedRulesets = deletedRulesets;
      }
    }

    return result;
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync ruleset: ${error.message}`,
      dryRun
    };
  }
}

/**
 * Sync pull request template file to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} templatePath - Path to local pull request template file
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncPullRequestTemplate(octokit, repo, templatePath, prTitle, dryRun) {
  return syncFileViaPullRequest(
    octokit,
    repo,
    {
      sourceFilePath: templatePath,
      targetPath: '.github/pull_request_template.md',
      branchName: 'pull-request-template-sync',
      prTitle,
      prBodyCreate: `This PR adds \`.github/pull_request_template.md\` to standardize pull requests.\n\n**Changes:**\n- Added pull request template`,
      prBodyUpdate: `This PR updates \`.github/pull_request_template.md\` to the latest version.\n\n**Changes:**\n- Updated pull request template`,
      resultKey: 'pullRequestTemplate',
      fileDescription: 'pull request template'
    },
    dryRun
  );
}

/**
 * Sync workflow files to target repository via a single pull request
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {Array<string>} workflowFilePaths - Array of local workflow file paths to sync
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncWorkflowFiles(octokit, repo, workflowFilePaths, prTitle, dryRun) {
  // Validate that workflow files array is non-empty
  if (!workflowFilePaths || workflowFilePaths.length === 0) {
    return {
      repository: repo,
      success: false,
      error: 'No workflow files specified',
      dryRun
    };
  }

  // Build files array - extract filename from source path and use as target
  const files = workflowFilePaths.map(filePath => ({
    sourceFilePath: filePath,
    targetPath: `.github/workflows/${path.basename(filePath)}`
  }));

  return syncFilesViaPullRequest(
    octokit,
    repo,
    {
      files,
      branchName: 'workflow-files-sync',
      prTitle,
      prBodyCreate: 'This PR adds workflow files.',
      prBodyUpdate: 'This PR syncs workflow files to the latest versions.',
      resultKey: 'workflowFiles',
      fileDescription: 'workflow files'
    },
    dryRun
  );
}

/**
 * Sync autolink references to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} autolinksFilePath - Path to local autolinks JSON file
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncAutolinks(octokit, repo, autolinksFilePath, dryRun) {
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  try {
    // Read the source autolinks JSON file
    let autolinksConfig;
    try {
      const fileContent = fs.readFileSync(autolinksFilePath, 'utf8');
      autolinksConfig = JSON.parse(fileContent);
    } catch (error) {
      return {
        repository: repo,
        success: false,
        error: `Failed to read or parse autolinks file at ${autolinksFilePath}: ${error.message}`,
        dryRun
      };
    }

    // Validate that the config has an autolinks array
    if (!Array.isArray(autolinksConfig.autolinks)) {
      return {
        repository: repo,
        success: false,
        error: 'Autolinks configuration must contain an "autolinks" array.',
        dryRun
      };
    }

    // Validate each autolink entry
    for (const autolink of autolinksConfig.autolinks) {
      if (!autolink.key_prefix || !autolink.url_template) {
        return {
          repository: repo,
          success: false,
          error: 'Each autolink must have "key_prefix" and "url_template" fields.',
          dryRun
        };
      }
    }

    // Get existing autolinks for the repository
    let existingAutolinks = [];
    try {
      const { data } = await octokit.rest.repos.listAutolinks({
        owner,
        repo: repoName
      });
      existingAutolinks = data;
    } catch (error) {
      // If we get a 404, autolinks might not be available or accessible
      if (error.status === 404) {
        core.info(`  🔗 Repository ${repo} does not have autolinks accessible`);
      } else {
        throw error;
      }
    }

    // Compare existing autolinks with desired configuration
    const autolinksToCreate = [];
    const autolinksToDelete = [];
    const autolinksUnchanged = [];

    // Find autolinks that need to be created or are unchanged
    for (const desiredAutolink of autolinksConfig.autolinks) {
      const existing = existingAutolinks.find(
        e =>
          e.key_prefix === desiredAutolink.key_prefix &&
          e.url_template === desiredAutolink.url_template &&
          (e.is_alphanumeric ?? true) === (desiredAutolink.is_alphanumeric ?? true)
      );

      if (existing) {
        autolinksUnchanged.push(desiredAutolink);
      } else {
        // Check if there's an existing autolink with the same key_prefix but different settings
        const existingWithSamePrefix = existingAutolinks.find(e => e.key_prefix === desiredAutolink.key_prefix);
        if (existingWithSamePrefix) {
          // Need to delete the old one and create the new one
          autolinksToDelete.push(existingWithSamePrefix);
        }
        autolinksToCreate.push(desiredAutolink);
      }
    }

    // Find autolinks that need to be deleted (exist in repo but not in config)
    for (const existingAutolink of existingAutolinks) {
      const inConfig = autolinksConfig.autolinks.find(d => d.key_prefix === existingAutolink.key_prefix);
      if (!inConfig) {
        autolinksToDelete.push(existingAutolink);
      }
    }

    // If no changes needed, return early
    if (autolinksToCreate.length === 0 && autolinksToDelete.length === 0) {
      return {
        repository: repo,
        success: true,
        autolinks: 'unchanged',
        message: `All ${autolinksUnchanged.length} autolink(s) are already up to date`,
        autolinksUnchanged: autolinksUnchanged.length,
        dryRun
      };
    }

    if (dryRun) {
      const message = [];
      if (autolinksToCreate.length > 0) {
        message.push(`Would create ${autolinksToCreate.length} autolink(s)`);
      }
      if (autolinksToDelete.length > 0) {
        message.push(`Would delete ${autolinksToDelete.length} autolink(s)`);
      }
      return {
        repository: repo,
        success: true,
        autolinks: 'would-update',
        message: message.join(', '),
        autolinksWouldCreate: autolinksToCreate.map(a => a.key_prefix),
        autolinksWouldDelete: autolinksToDelete.map(a => a.key_prefix),
        autolinksUnchanged: autolinksUnchanged.length,
        dryRun
      };
    }

    // Delete autolinks that are no longer needed or have changed
    for (const autolink of autolinksToDelete) {
      await octokit.rest.repos.deleteAutolink({
        owner,
        repo: repoName,
        autolink_id: autolink.id
      });
      core.info(`  🔗 Deleted autolink: ${autolink.key_prefix}`);
    }

    // Create new autolinks
    for (const autolink of autolinksToCreate) {
      await octokit.rest.repos.createAutolink({
        owner,
        repo: repoName,
        key_prefix: autolink.key_prefix,
        url_template: autolink.url_template,
        is_alphanumeric: autolink.is_alphanumeric ?? true
      });
      core.info(`  🔗 Created autolink: ${autolink.key_prefix}`);
    }

    const message = [];
    if (autolinksToCreate.length > 0) {
      message.push(`Created ${autolinksToCreate.length} autolink(s)`);
    }
    if (autolinksToDelete.length > 0) {
      message.push(`Deleted ${autolinksToDelete.length} autolink(s)`);
    }

    return {
      repository: repo,
      success: true,
      autolinks: 'updated',
      message: message.join(', '),
      autolinksCreated: autolinksToCreate.map(a => a.key_prefix),
      autolinksDeleted: autolinksToDelete.map(a => a.key_prefix),
      autolinksUnchanged: autolinksUnchanged.length,
      dryRun
    };
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync autolinks: ${error.message}`,
      dryRun
    };
  }
}

/**
 * Sync copilot-instructions.md file to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} copilotInstructionsPath - Path to local copilot-instructions.md file
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncCopilotInstructions(octokit, repo, copilotInstructionsPath, prTitle, dryRun) {
  return syncFileViaPullRequest(
    octokit,
    repo,
    {
      sourceFilePath: copilotInstructionsPath,
      targetPath: '.github/copilot-instructions.md',
      branchName: 'copilot-instructions-md-sync',
      prTitle,
      prBodyCreate: `This PR adds \`.github/copilot-instructions.md\` to configure GitHub Copilot.\n\n**Changes:**\n- Added Copilot instructions`,
      prBodyUpdate: `This PR updates \`.github/copilot-instructions.md\` to the latest version.\n\n**Changes:**\n- Updated Copilot instructions`,
      resultKey: 'copilotInstructions',
      fileDescription: 'copilot-instructions.md'
    },
    dryRun
  );
}

/**
 * Check if a repository result has any changes
 * @param {Object} result - Repository update result object
 * @returns {boolean} True if there are any changes (settings, topics, code scanning, immutable releases, dependabot, gitignore, rulesets, pull request template, workflow files, autolinks, copilot instructions, or package.json)
 */
function hasRepositoryChanges(result) {
  return (
    (result.changes && result.changes.length > 0) ||
    result.topicsChange ||
    result.codeScanningChange ||
    result.immutableReleasesChange ||
    (result.dependabotSync &&
      result.dependabotSync.success &&
      result.dependabotSync.dependabotYml &&
      result.dependabotSync.dependabotYml !== 'unchanged') ||
    (result.gitignoreSync &&
      result.gitignoreSync.success &&
      result.gitignoreSync.gitignore &&
      result.gitignoreSync.gitignore !== 'unchanged') ||
    (result.rulesetSync &&
      result.rulesetSync.success &&
      result.rulesetSync.ruleset &&
      result.rulesetSync.ruleset !== 'unchanged') ||
    (result.pullRequestTemplateSync &&
      result.pullRequestTemplateSync.success &&
      result.pullRequestTemplateSync.pullRequestTemplate &&
      result.pullRequestTemplateSync.pullRequestTemplate !== 'unchanged') ||
    (result.workflowFilesSync &&
      result.workflowFilesSync.success &&
      result.workflowFilesSync.workflowFiles &&
      result.workflowFilesSync.workflowFiles !== 'unchanged') ||
    (result.autolinksSync &&
      result.autolinksSync.success &&
      result.autolinksSync.autolinks &&
      result.autolinksSync.autolinks !== 'unchanged') ||
    (result.copilotInstructionsSync &&
      result.copilotInstructionsSync.success &&
      result.copilotInstructionsSync.copilotInstructions &&
      result.copilotInstructionsSync.copilotInstructions !== 'unchanged') ||
    (result.packageJsonSync &&
      result.packageJsonSync.success &&
      result.packageJsonSync.packageJson &&
      result.packageJsonSync.packageJson !== 'unchanged')
  );
}

/**
 * Main action logic
 */
export async function run() {
  try {
    // Get inputs
    const githubToken = getInput('github-token');
    const githubApiUrl = getInput('github-api-url') || 'https://api.github.com';
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

    const enableCodeScanning = getBooleanInput('enable-default-code-scanning');
    const immutableReleases = getBooleanInput('immutable-releases');
    const dryRun = getBooleanInput('dry-run');

    // Parse topics if provided
    const topicsInput = getInput('topics');
    const topics = topicsInput
      ? topicsInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
      : null;

    // Get dependabot.yml settings
    const dependabotYml = getInput('dependabot-yml');
    const dependabotPrTitle = getInput('dependabot-pr-title') || 'chore: update dependabot.yml';

    // Get .gitignore settings
    const gitignore = getInput('gitignore');
    const gitignorePrTitle = getInput('gitignore-pr-title') || 'chore: update .gitignore';

    // Get rulesets settings
    const rulesetsFile = getInput('rulesets-file');
    const deleteUnmanagedRulesets = getBooleanInput('delete-unmanaged-rulesets');

    // Get pull request template settings
    const pullRequestTemplate = getInput('pull-request-template');
    const pullRequestTemplatePrTitle =
      getInput('pull-request-template-pr-title') || 'chore: update pull request template';

    // Get workflow files settings
    const workflowFilesInput = getInput('workflow-files');
    const workflowFiles = workflowFilesInput
      ? workflowFilesInput
          .split(',')
          .map(f => f.trim())
          .filter(f => f.length > 0)
      : null;
    const workflowFilesPrTitle = getInput('workflow-files-pr-title') || 'chore: sync workflow configuration';

    // Get autolinks settings
    const autolinksFile = getInput('autolinks-file');

    // Get copilot instructions settings
    const copilotInstructionsMd = getInput('copilot-instructions-md');
    const copilotInstructionsPrTitle =
      getInput('copilot-instructions-pr-title') || 'chore: update copilot-instructions.md';

    // Get package.json sync settings
    const packageJsonFile = getInput('package-json-file');
    const syncScripts = getBooleanInput('sync-scripts');
    const syncEngines = getBooleanInput('sync-engines');
    const packageJsonPrTitle = getInput('package-json-pr-title') || 'chore: update package.json';

    core.info('Starting Bulk GitHub Repository Settings Action...');

    if (dryRun) {
      core.info('🔍 DRY-RUN MODE: No changes will be applied');
    }

    if (!githubToken) {
      throw new Error('github-token is required');
    }

    // Check if any settings are specified
    const hasSettings =
      Object.values(settings).some(value => value !== null) ||
      enableCodeScanning ||
      immutableReleases !== null ||
      topics !== null ||
      dependabotYml ||
      gitignore ||
      rulesetsFile ||
      pullRequestTemplate ||
      (workflowFiles && workflowFiles.length > 0) ||
      autolinksFile ||
      copilotInstructionsMd ||
      (packageJsonFile && (syncScripts || syncEngines));
    if (!hasSettings) {
      throw new Error(
        'At least one repository setting must be specified (or enable-default-code-scanning must be true, or immutable-releases must be specified, or topics must be provided, or dependabot-yml must be specified, or gitignore must be specified, or rulesets-file must be specified, or pull-request-template must be specified, or workflow-files must be specified, or autolinks-file must be specified, or copilot-instructions-md must be specified, or package-json-file with sync-scripts or sync-engines must be specified)'
      );
    }

    // Initialize Octokit
    const octokit = new Octokit({
      auth: githubToken,
      baseUrl: githubApiUrl
    });

    // Parse repository list
    const repoList = await parseRepositories(repositories, repositoriesFile, owner, octokit);

    core.info(`Processing ${repoList.length} repositories...`);
    core.info(`Settings to apply: ${JSON.stringify(settings, null, 2)}`);
    if (enableCodeScanning) {
      core.info('CodeQL scanning will be enabled');
    }
    if (immutableReleases !== null) {
      core.info(`Immutable releases will be ${immutableReleases ? 'enabled' : 'disabled'}`);
    }
    if (topics !== null) {
      core.info(`Topics to set: ${topics.join(', ')}`);
    }
    if (dependabotYml) {
      core.info(`Dependabot.yml will be synced from: ${dependabotYml}`);
    }
    if (gitignore) {
      core.info(`.gitignore will be synced from: ${gitignore}`);
    }
    if (rulesetsFile) {
      core.info(`Repository ruleset will be synced from: ${rulesetsFile}`);
    }
    if (pullRequestTemplate) {
      core.info(`Pull request template will be synced from: ${pullRequestTemplate}`);
    }
    if (workflowFiles) {
      core.info(`Workflow files will be synced from: ${workflowFiles.join(', ')}`);
    }
    if (autolinksFile) {
      core.info(`Autolinks will be synced from: ${autolinksFile}`);
    }
    if (copilotInstructionsMd) {
      core.info(`Copilot-instructions.md will be synced from: ${copilotInstructionsMd}`);
    }

    // Update repositories
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const repoConfig of repoList) {
      const repo = repoConfig.repo;
      core.info(`Updating ${repo}...`);

      // Merge global settings with repo-specific overrides
      const repoSettings = {
        allow_squash_merge:
          repoConfig['allow-squash-merge'] !== undefined
            ? repoConfig['allow-squash-merge']
            : settings.allow_squash_merge,
        allow_merge_commit:
          repoConfig['allow-merge-commit'] !== undefined
            ? repoConfig['allow-merge-commit']
            : settings.allow_merge_commit,
        allow_rebase_merge:
          repoConfig['allow-rebase-merge'] !== undefined
            ? repoConfig['allow-rebase-merge']
            : settings.allow_rebase_merge,
        allow_auto_merge:
          repoConfig['allow-auto-merge'] !== undefined ? repoConfig['allow-auto-merge'] : settings.allow_auto_merge,
        delete_branch_on_merge:
          repoConfig['delete-branch-on-merge'] !== undefined
            ? repoConfig['delete-branch-on-merge']
            : settings.delete_branch_on_merge,
        allow_update_branch:
          repoConfig['allow-update-branch'] !== undefined
            ? repoConfig['allow-update-branch']
            : settings.allow_update_branch
      };

      const repoEnableCodeScanning =
        repoConfig['enable-default-code-scanning'] !== undefined
          ? repoConfig['enable-default-code-scanning']
          : enableCodeScanning;

      // Handle repo-specific immutable releases
      const repoImmutableReleases =
        repoConfig['immutable-releases'] !== undefined ? repoConfig['immutable-releases'] : immutableReleases;

      // Handle repo-specific topics
      let repoTopics = topics;
      if (repoConfig.topics !== undefined) {
        if (typeof repoConfig.topics === 'string') {
          repoTopics = repoConfig.topics
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
        } else if (Array.isArray(repoConfig.topics)) {
          repoTopics = repoConfig.topics;
        } else {
          repoTopics = null;
        }
      }

      // Handle repo-specific dependabot.yml
      let repoDependabotYml = dependabotYml;
      if (repoConfig['dependabot-yml'] !== undefined) {
        repoDependabotYml = repoConfig['dependabot-yml'];
      }

      // Handle repo-specific .gitignore
      let repoGitignore = gitignore;
      if (repoConfig['gitignore'] !== undefined) {
        repoGitignore = repoConfig['gitignore'];
      }

      // Handle repo-specific rulesets-file
      let repoRulesetsFile = rulesetsFile;
      if (repoConfig['rulesets-file'] !== undefined) {
        repoRulesetsFile = repoConfig['rulesets-file'];
      }

      // Handle repo-specific pull-request-template
      let repoPullRequestTemplate = pullRequestTemplate;
      if (repoConfig['pull-request-template'] !== undefined) {
        repoPullRequestTemplate = repoConfig['pull-request-template'];
      }

      // Handle repo-specific workflow-files
      let repoWorkflowFiles = workflowFiles;
      if (repoConfig['workflow-files'] !== undefined) {
        if (typeof repoConfig['workflow-files'] === 'string') {
          repoWorkflowFiles = repoConfig['workflow-files']
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
        } else if (Array.isArray(repoConfig['workflow-files'])) {
          repoWorkflowFiles = repoConfig['workflow-files'];
        } else {
          repoWorkflowFiles = null;
        }
      }

      // Handle repo-specific autolinks-file
      let repoAutolinksFile = autolinksFile;
      if (repoConfig['autolinks-file'] !== undefined) {
        repoAutolinksFile = repoConfig['autolinks-file'];
      }

      // Handle repo-specific copilot-instructions-md
      let repoCopilotInstructionsMd = copilotInstructionsMd;
      if (repoConfig['copilot-instructions-md'] !== undefined) {
        repoCopilotInstructionsMd = repoConfig['copilot-instructions-md'];
      }

      const result = await updateRepositorySettings(
        octokit,
        repo,
        repoSettings,
        repoEnableCodeScanning,
        repoImmutableReleases,
        repoTopics,
        dryRun
      );
      results.push(result);

      // Sync dependabot.yml if specified
      if (repoDependabotYml) {
        core.info(`  📦 Checking dependabot.yml...`);
        const dependabotResult = await syncDependabotYml(octokit, repo, repoDependabotYml, dependabotPrTitle, dryRun);

        // Add dependabot result to the main result
        result.dependabotSync = dependabotResult;

        if (dependabotResult.success) {
          core.info(`  📦 ${dependabotResult.message}`);
          if (dependabotResult.prUrl) {
            core.info(`  🔗 PR URL: ${dependabotResult.prUrl}`);
          }
        } else {
          core.warning(`  ⚠️  ${dependabotResult.error}`);
        }
      }

      // Sync .gitignore if specified
      if (repoGitignore) {
        core.info(`  📝 Checking .gitignore...`);
        const gitignoreResult = await syncGitignore(octokit, repo, repoGitignore, gitignorePrTitle, dryRun);

        // Add gitignore result to the main result
        result.gitignoreSync = gitignoreResult;

        if (gitignoreResult.success) {
          core.info(`  📝 ${gitignoreResult.message}`);
          if (gitignoreResult.prUrl) {
            core.info(`  🔗 PR URL: ${gitignoreResult.prUrl}`);
          }
        } else {
          core.warning(`  ⚠️  ${gitignoreResult.error}`);
        }
      }

      // Sync repository ruleset if specified
      if (repoRulesetsFile) {
        core.info(`  📋 Checking repository ruleset...`);
        const rulesetResult = await syncRepositoryRuleset(
          octokit,
          repo,
          repoRulesetsFile,
          deleteUnmanagedRulesets,
          dryRun
        );

        // Add ruleset result to the main result
        result.rulesetSync = rulesetResult;

        if (rulesetResult.success) {
          core.info(`  📋 ${rulesetResult.message}`);
        } else {
          core.warning(`  ⚠️  ${rulesetResult.error}`);
        }
      }

      // Sync pull request template if specified
      if (repoPullRequestTemplate) {
        core.info(`  📝 Checking pull request template...`);
        const templateResult = await syncPullRequestTemplate(
          octokit,
          repo,
          repoPullRequestTemplate,
          pullRequestTemplatePrTitle,
          dryRun
        );

        // Add pull request template result to the main result
        result.pullRequestTemplateSync = templateResult;

        if (templateResult.success) {
          core.info(`  📝 ${templateResult.message}`);
          if (templateResult.prUrl) {
            core.info(`  🔗 PR URL: ${templateResult.prUrl}`);
          }
        } else {
          core.warning(`  ⚠️  ${templateResult.error}`);
        }
      }

      // Sync workflow files if specified
      if (repoWorkflowFiles && repoWorkflowFiles.length > 0) {
        core.info(`  🔧 Checking workflow files...`);
        const workflowResult = await syncWorkflowFiles(octokit, repo, repoWorkflowFiles, workflowFilesPrTitle, dryRun);

        // Add workflow files result to the main result
        result.workflowFilesSync = workflowResult;

        if (workflowResult.success) {
          core.info(`  🔧 ${workflowResult.message}`);
          if (workflowResult.prUrl) {
            core.info(`  🔗 PR URL: ${workflowResult.prUrl}`);
          }
        } else {
          core.warning(`  ⚠️  ${workflowResult.error}`);
        }
      }

      // Sync autolinks if specified
      if (repoAutolinksFile) {
        core.info(`  🔗 Checking autolinks...`);
        const autolinksResult = await syncAutolinks(octokit, repo, repoAutolinksFile, dryRun);

        // Add autolinks result to the main result
        result.autolinksSync = autolinksResult;

        if (autolinksResult.success) {
          core.info(`  🔗 ${autolinksResult.message}`);
        } else {
          core.warning(`  ⚠️  ${autolinksResult.error}`);
        }
      }

      // Sync copilot-instructions.md if specified
      if (repoCopilotInstructionsMd) {
        core.info(`  🤖 Checking copilot-instructions.md...`);
        const copilotResult = await syncCopilotInstructions(
          octokit,
          repo,
          repoCopilotInstructionsMd,
          copilotInstructionsPrTitle,
          dryRun
        );

        // Add copilot instructions result to the main result
        result.copilotInstructionsSync = copilotResult;

        if (copilotResult.success) {
          core.info(`  🤖 ${copilotResult.message}`);
          if (copilotResult.prUrl) {
            core.info(`  🔗 PR URL: ${copilotResult.prUrl}`);
          }
        } else {
          core.warning(`  ⚠️  ${copilotResult.error}`);
        }
      }

      // Sync package.json if specified
      const repoPackageJsonFile = repoConfig?.['package-json-file'] || packageJsonFile;
      const repoSyncScripts = repoConfig?.['sync-scripts'] !== undefined ? repoConfig['sync-scripts'] : syncScripts;
      const repoSyncEngines = repoConfig?.['sync-engines'] !== undefined ? repoConfig['sync-engines'] : syncEngines;

      if (repoPackageJsonFile && (repoSyncScripts || repoSyncEngines)) {
        core.info(`  📦 Checking package.json...`);
        const packageJsonResult = await syncPackageJson(
          octokit,
          repo,
          repoPackageJsonFile,
          repoSyncScripts,
          repoSyncEngines,
          packageJsonPrTitle,
          dryRun
        );

        // Add package.json result to the main result
        result.packageJsonSync = packageJsonResult;

        if (packageJsonResult.success) {
          core.info(`  📦 ${packageJsonResult.message}`);
          if (packageJsonResult.prUrl) {
            core.info(`  🔗 PR URL: ${packageJsonResult.prUrl}`);
          }
          if (packageJsonResult.changes && packageJsonResult.changes.length > 0) {
            for (const change of packageJsonResult.changes) {
              core.info(`     - ${dryRun ? 'Would update' : 'Updated'} ${change.field}`);
            }
          }
        } else {
          core.warning(`  ⚠️  ${packageJsonResult.error}`);
        }
      }

      if (result.success) {
        successCount++;
        if (dryRun) {
          core.info(`🔍 Would update ${repo}`);
        } else {
          core.info(`✅ Successfully updated ${repo}`);
        }

        // Log repository setting changes
        if (result.changes && result.changes.length > 0) {
          core.info(`  📝 Settings changes:`);
          for (const change of result.changes) {
            const settingName = change.setting.replace(/_/g, '-');
            core.info(`     ${settingName}: ${change.from} → ${change.to}`);
          }
        }

        // Log topics changes
        if (result.topicsChange) {
          if (result.topicsChange.added.length > 0) {
            const addedTopics = result.topicsChange.added.join(', ');
            if (dryRun) {
              core.info(`  🏷️  Would add topics: ${addedTopics}`);
            } else {
              core.info(`  🏷️  Topics added: ${addedTopics}`);
            }
          }
          if (result.topicsChange.removed.length > 0) {
            const removedTopics = result.topicsChange.removed.join(', ');
            if (dryRun) {
              core.info(`  🏷️  Would remove topics: ${removedTopics}`);
            } else {
              core.info(`  🏷️  Topics removed: ${removedTopics}`);
            }
          }
        } else if (result.topicsUnchanged) {
          core.info(`  🏷️  Topics unchanged: ${result.topics.join(', ')}`);
        }

        if (result.topicsWarning) {
          core.warning(`  ⚠️ ${result.topicsWarning}`);
        }

        // Log code scanning changes
        if (result.codeScanningChange) {
          if (dryRun) {
            core.info(
              `  📊 Would enable CodeQL scanning: ${result.codeScanningChange.from} → ${result.codeScanningChange.to}`
            );
          } else {
            core.info(
              `  📊 CodeQL scanning enabled: ${result.codeScanningChange.from} → ${result.codeScanningChange.to}`
            );
          }
        } else if (result.codeScanningUnchanged) {
          core.info(`  📊 CodeQL scanning unchanged: already configured`);
        }

        if (result.codeScanningWarning) {
          core.warning(`  ⚠️ ${result.codeScanningWarning}`);
        }

        // Log immutable releases changes
        if (result.immutableReleasesChange) {
          if (dryRun) {
            core.info(
              `  🔒 Would ${result.immutableReleasesChange.to ? 'enable' : 'disable'} immutable releases: ${result.immutableReleasesChange.from} → ${result.immutableReleasesChange.to}`
            );
          } else {
            core.info(
              `  🔒 Immutable releases ${result.immutableReleasesChange.to ? 'enabled' : 'disabled'}: ${result.immutableReleasesChange.from} → ${result.immutableReleasesChange.to}`
            );
          }
        } else if (result.immutableReleasesUnchanged) {
          core.info(`  🔒 Immutable releases unchanged: ${result.currentImmutableReleases ? 'enabled' : 'disabled'}`);
        }

        if (result.immutableReleasesWarning) {
          core.warning(`  ⚠️ ${result.immutableReleasesWarning}`);
        }

        // Log if no changes were needed
        if (!hasRepositoryChanges(result)) {
          core.info(`  ℹ️  No changes needed - all settings already match desired state`);
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
      ...results.map(r => {
        if (!r.success) {
          return [r.repository, '❌ Failed', r.error];
        }

        // Determine what actually happened
        const hasChanges = hasRepositoryChanges(r);

        let details;
        if (dryRun) {
          details = hasChanges ? 'Would update' : 'No changes needed';
        } else {
          details = hasChanges ? 'Updated' : 'No changes needed';
        }

        return [r.repository, '✅ Success', details];
      })
    ];

    try {
      const heading = dryRun
        ? 'Bulk Repository Settings Update Results (DRY-RUN)'
        : 'Bulk Repository Settings Update Results';

      let summaryBuilder = core.summary.addHeading(heading);

      if (dryRun) {
        summaryBuilder = summaryBuilder.addRaw('\n**🔍 DRY-RUN MODE:** No changes were applied\n');
      }

      summaryBuilder
        .addRaw(`\n**Total Repositories:** ${repoList.length}`)
        .addRaw(`\n**Successful:** ${successCount}`)
        .addRaw(`\n**Failed:** ${failureCount}\n\n`)
        .addTable(summaryTable)
        .write();
    } catch {
      // Fallback for local development
      const heading = dryRun
        ? '🔍 DRY-RUN: Bulk Repository Settings Update Results'
        : '📊 Bulk Repository Settings Update Results';
      core.info(heading);
      core.info(`Total Repositories: ${repoList.length}`);
      core.info(`Successful: ${successCount}`);
      core.info(`Failed: ${failureCount}`);
      for (const result of results) {
        if (!result.success) {
          core.info(`  ${result.repository}: ❌ ${result.error}`);
        } else {
          const hasChanges = hasRepositoryChanges(result);
          const details = dryRun
            ? hasChanges
              ? 'Would update'
              : 'No changes needed'
            : hasChanges
              ? 'Updated'
              : 'No changes needed';
          core.info(`  ${result.repository}: ✅ ${details}`);
        }
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
