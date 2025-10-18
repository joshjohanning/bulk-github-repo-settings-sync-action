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
 *    export INPUT_PACKAGE_JSON_FILE="./path/to/package.json"
 *    export INPUT_SYNC_DEV_DEPENDENCIES="true"
 *    export INPUT_SYNC_SCRIPTS="true"
 *    export INPUT_PACKAGE_JSON_PR_TITLE="chore: update package.json"
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
 * @param {Array<string>|null} topics - Topics to set on repository
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function updateRepositorySettings(octokit, repo, settings, enableCodeScanning, topics, dryRun) {
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
 * Sync dependabot.yml file to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} dependabotYmlPath - Path to local dependabot.yml file
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncDependabotYml(octokit, repo, dependabotYmlPath, prTitle, dryRun) {
  const [owner, repoName] = repo.split('/');
  const targetPath = '.github/dependabot.yml';

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  try {
    // Read the source dependabot.yml file
    let sourceContent;
    try {
      sourceContent = fs.readFileSync(dependabotYmlPath, 'utf8');
    } catch (error) {
      return {
        repository: repo,
        success: false,
        error: `Failed to read dependabot.yml file at ${dependabotYmlPath}: ${error.message}`,
        dryRun
      };
    }

    // Get default branch
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo: repoName
    });
    const defaultBranch = repoData.default_branch;

    // Check if dependabot.yml exists in the target repo
    let existingSha = null;
    let existingContent = null;

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: targetPath,
        ref: defaultBranch
      });
      existingSha = data.sha;
      existingContent = Buffer.from(data.content, 'base64').toString('utf8');
    } catch (error) {
      if (error.status === 404) {
        // File doesn't exist - this is fine, we'll create it
        core.info(`  📄 ${targetPath} does not exist in ${repo}, will create it`);
      } else {
        throw error;
      }
    }

    // Compare content
    const needsUpdate = !existingContent || existingContent.trim() !== sourceContent.trim();

    if (!needsUpdate) {
      return {
        repository: repo,
        success: true,
        dependabotYml: 'unchanged',
        message: `${targetPath} is already up to date`,
        dryRun
      };
    }

    // Check if there's already an open PR for this update
    const branchName = 'dependabot-yml-sync';
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
      // Non-fatal, continue
      core.warning(`  ⚠️  Could not check for existing PRs: ${error.message}`);
    }

    // If there's already an open PR, don't create/update another one
    if (existingPR) {
      return {
        repository: repo,
        success: true,
        dependabotYml: 'pr-exists',
        message: `Open PR #${existingPR.number} already exists for ${targetPath}`,
        prNumber: existingPR.number,
        prUrl: existingPR.html_url,
        dryRun
      };
    }

    if (dryRun) {
      return {
        repository: repo,
        success: true,
        dependabotYml: existingContent ? 'would-update' : 'would-create',
        message: existingContent ? `Would update ${targetPath} via PR` : `Would create ${targetPath} via PR`,
        dryRun
      };
    }

    // Create or get reference to the branch
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

    // Create or update the file
    const commitMessage = existingContent ? `chore: update ${targetPath}` : `chore: add ${targetPath}`;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: targetPath,
      message: commitMessage,
      content: Buffer.from(sourceContent).toString('base64'),
      branch: branchName,
      sha: existingSha || undefined
    });

    core.info(`  ✍️  Committed changes to ${targetPath}`);

    // Prepare PR body content
    const prBody = existingContent
      ? `This PR updates \`.github/dependabot.yml\` to the latest version.\n\n**Changes:**\n- Updated dependabot configuration`
      : `This PR adds \`.github/dependabot.yml\` to enable Dependabot.\n\n**Changes:**\n- Added dependabot configuration`;

    // Create or update PR
    let prNumber;
    if (existingPR) {
      // Update existing PR
      await octokit.rest.pulls.update({
        owner,
        repo: repoName,
        pull_number: existingPR.number,
        title: prTitle,
        body: prBody
      });
      prNumber = existingPR.number;
      core.info(`  🔄 Updated existing PR #${prNumber}`);
    } else {
      // Create new PR
      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo: repoName,
        title: prTitle,
        head: branchName,
        base: defaultBranch,
        body: prBody
      });
      prNumber = pr.number;
      core.info(`  📬 Created PR #${prNumber}: ${pr.html_url}`);
    }

    return {
      repository: repo,
      success: true,
      dependabotYml: existingContent ? 'updated' : 'created',
      prNumber,
      prUrl: `https://github.com/${owner}/${repoName}/pull/${prNumber}`,
      message: existingContent
        ? `Updated ${targetPath} via PR #${prNumber}`
        : `Created ${targetPath} via PR #${prNumber}`,
      dryRun
    };
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync dependabot.yml: ${error.message}`,
      dryRun
    };
  }
}

/**
 * Sync package.json devDependencies and/or scripts to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} packageJsonPath - Path to local package.json file
 * @param {boolean} syncDevDependencies - Whether to sync devDependencies
 * @param {boolean} syncScripts - Whether to sync scripts
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncPackageJson(
  octokit,
  repo,
  packageJsonPath,
  syncDevDependencies,
  syncScripts,
  prTitle,
  dryRun
) {
  const [owner, repoName] = repo.split('/');
  const targetPath = 'package.json';

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  if (!syncDevDependencies && !syncScripts) {
    return {
      repository: repo,
      success: false,
      error: 'At least one of syncDevDependencies or syncScripts must be enabled',
      dryRun
    };
  }

  try {
    // Read the source package.json file
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
      } else {
        throw error;
      }
    }

    // Create updated package.json by merging selected fields
    const updatedPackageJson = { ...existingPackageJson };
    const changes = [];

    if (syncDevDependencies && sourcePackageJson.devDependencies) {
      const oldDevDeps = existingPackageJson.devDependencies || {};
      const newDevDeps = sourcePackageJson.devDependencies;

      // Check if there are any changes
      const devDepsChanged =
        JSON.stringify(oldDevDeps, Object.keys(oldDevDeps).sort()) !==
        JSON.stringify(newDevDeps, Object.keys(newDevDeps).sort());

      if (devDepsChanged) {
        updatedPackageJson.devDependencies = newDevDeps;
        changes.push({
          field: 'devDependencies',
          from: oldDevDeps,
          to: newDevDeps
        });
      }
    }

    if (syncScripts && sourcePackageJson.scripts) {
      const oldScripts = existingPackageJson.scripts || {};
      const newScripts = sourcePackageJson.scripts;

      // Check if there are any changes
      const scriptsChanged =
        JSON.stringify(oldScripts, Object.keys(oldScripts).sort()) !==
        JSON.stringify(newScripts, Object.keys(newScripts).sort());

      if (scriptsChanged) {
        updatedPackageJson.scripts = newScripts;
        changes.push({
          field: 'scripts',
          from: oldScripts,
          to: newScripts
        });
      }
    }

    // If no changes needed
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
    const branchName = 'package-json-sync';
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
      // Non-fatal, continue
      core.warning(`  ⚠️  Could not check for existing PRs: ${error.message}`);
    }

    // If there's already an open PR, don't create/update another one
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

    // Create or get reference to the branch
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

    // Prepare the updated package.json content with proper formatting
    const updatedContent = `${JSON.stringify(updatedPackageJson, null, 2)}\n`;

    // Step 1: Update package.json
    const commitMessage = `chore: update ${targetPath}`;
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: targetPath,
      message: commitMessage,
      content: Buffer.from(updatedContent).toString('base64'),
      branch: branchName,
      sha: existingSha
    });

    core.info(`  ✍️  Committed changes to ${targetPath}`);

    // Step 2: Get package-lock.json if it exists
    let packageLockSha = null;
    let packageLockExists = false;
    const packageLockPath = 'package-lock.json';

    try {
      const { data: packageLockData } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: packageLockPath,
        ref: branchName
      });
      packageLockSha = packageLockData.sha;
      packageLockExists = true;
    } catch (error) {
      if (error.status === 404) {
        core.info(`  📄 ${packageLockPath} does not exist, skipping lock file update`);
      } else {
        core.warning(`  ⚠️  Could not check for ${packageLockPath}: ${error.message}`);
      }
    }

    // Step 3: If package-lock.json exists, generate an updated version
    if (packageLockExists && syncDevDependencies) {
      core.info(`  🔄 Generating updated ${packageLockPath}...`);

      // We need to run npm install to generate the lock file
      // Since we can't run npm install remotely, we'll use a workaround:
      // Clone the updated package.json, run npm install locally, and push the result

      const { execSync } = await import('child_process');
      const path = await import('path');
      const os = await import('os');

      // Create a temporary directory
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-install-'));

      try {
        // Write the updated package.json to temp directory
        const tmpPackageJsonPath = path.join(tmpDir, 'package.json');
        fs.writeFileSync(tmpPackageJsonPath, updatedContent);

        // Run npm install to generate package-lock.json
        core.info(`  📦 Running npm install in temporary directory...`);
        execSync('npm install --package-lock-only', {
          cwd: tmpDir,
          stdio: 'pipe'
        });

        // Read the generated package-lock.json
        const tmpPackageLockPath = path.join(tmpDir, 'package-lock.json');
        if (fs.existsSync(tmpPackageLockPath)) {
          const updatedPackageLock = fs.readFileSync(tmpPackageLockPath, 'utf8');

          // Commit the updated package-lock.json
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo: repoName,
            path: packageLockPath,
            message: 'chore: update package-lock.json',
            content: Buffer.from(updatedPackageLock).toString('base64'),
            branch: branchName,
            sha: packageLockSha
          });

          core.info(`  ✍️  Committed changes to ${packageLockPath}`);
        } else {
          core.warning(`  ⚠️  npm install did not generate ${packageLockPath}`);
        }
      } catch (error) {
        core.warning(`  ⚠️  Failed to update ${packageLockPath}: ${error.message}`);
      } finally {
        // Clean up temporary directory
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (error) {
          core.warning(`  ⚠️  Failed to clean up temporary directory: ${error.message}`);
        }
      }
    }

    // Prepare PR body content
    let prBody = `This PR updates \`package.json\``;
    if (syncDevDependencies && syncScripts) {
      prBody += ` to sync devDependencies and scripts.\n\n`;
    } else if (syncDevDependencies) {
      prBody += ` to sync devDependencies.\n\n`;
    } else if (syncScripts) {
      prBody += ` to sync scripts.\n\n`;
    }

    prBody += '**Changes:**\n';
    for (const change of changes) {
      prBody += `- Updated ${change.field}\n`;
    }

    if (packageLockExists && syncDevDependencies) {
      prBody += '- Updated package-lock.json\n';
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
    const prNumber = pr.number;
    core.info(`  📬 Created PR #${prNumber}: ${pr.html_url}`);

    return {
      repository: repo,
      success: true,
      packageJson: 'updated',
      prNumber,
      prUrl: pr.html_url,
      message: `Updated ${targetPath} via PR #${prNumber}`,
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
 * Check if a repository result has any changes
 * @param {Object} result - Repository update result object
 * @returns {boolean} True if there are any changes (settings, topics, code scanning, or dependabot)
 */
function hasRepositoryChanges(result) {
  return (
    (result.changes && result.changes.length > 0) ||
    result.topicsChange ||
    result.codeScanningChange ||
    (result.dependabotSync &&
      result.dependabotSync.success &&
      result.dependabotSync.dependabotYml &&
      result.dependabotSync.dependabotYml !== 'unchanged') ||
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

    // Get package.json sync settings
    const packageJsonFile = getInput('package-json-file');
    const syncDevDependencies = getBooleanInput('sync-dev-dependencies');
    const syncScripts = getBooleanInput('sync-scripts');
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
      topics !== null ||
      dependabotYml ||
      (packageJsonFile && (syncDevDependencies || syncScripts));
    if (!hasSettings) {
      throw new Error(
        'At least one repository setting must be specified (or enable-default-code-scanning must be true, or topics must be provided, or dependabot-yml must be specified, or package-json-file with sync-dev-dependencies/sync-scripts must be specified)'
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
    if (topics !== null) {
      core.info(`Topics to set: ${topics.join(', ')}`);
    }
    if (dependabotYml) {
      core.info(`Dependabot.yml will be synced from: ${dependabotYml}`);
    }
    if (packageJsonFile && (syncDevDependencies || syncScripts)) {
      core.info(`Package.json will be synced from: ${packageJsonFile}`);
      if (syncDevDependencies) {
        core.info('  - devDependencies will be synced');
      }
      if (syncScripts) {
        core.info('  - scripts will be synced');
      }
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

      const result = await updateRepositorySettings(
        octokit,
        repo,
        repoSettings,
        repoEnableCodeScanning,
        repoTopics,
        dryRun
      );
      results.push(result);

      // Sync dependabot.yml if specified
      if (repoDependabotYml) {
        core.info(`  📦 Syncing dependabot.yml...`);
        const dependabotResult = await syncDependabotYml(octokit, repo, repoDependabotYml, dependabotPrTitle, dryRun);

        // Add dependabot result to the main result
        result.dependabotSync = dependabotResult;

        if (dependabotResult.success) {
          if (dependabotResult.dependabotYml === 'unchanged') {
            core.info(`  📦 ${dependabotResult.message}`);
          } else if (dryRun) {
            core.info(`  📦 ${dependabotResult.message}`);
          } else {
            core.info(`  📦 ${dependabotResult.message}`);
            if (dependabotResult.prUrl) {
              core.info(`  🔗 PR URL: ${dependabotResult.prUrl}`);
            }
          }
        } else {
          core.warning(`  ⚠️  ${dependabotResult.error}`);
        }
      }

      // Handle repo-specific package.json settings
      let repoPackageJsonFile = packageJsonFile;
      let repoSyncDevDependencies = syncDevDependencies;
      let repoSyncScripts = syncScripts;
      if (repoConfig['package-json-file'] !== undefined) {
        repoPackageJsonFile = repoConfig['package-json-file'];
      }
      if (repoConfig['sync-dev-dependencies'] !== undefined) {
        repoSyncDevDependencies = repoConfig['sync-dev-dependencies'];
      }
      if (repoConfig['sync-scripts'] !== undefined) {
        repoSyncScripts = repoConfig['sync-scripts'];
      }

      // Sync package.json if specified
      if (repoPackageJsonFile && (repoSyncDevDependencies || repoSyncScripts)) {
        core.info(`  📦 Syncing package.json...`);
        const packageJsonResult = await syncPackageJson(
          octokit,
          repo,
          repoPackageJsonFile,
          repoSyncDevDependencies,
          repoSyncScripts,
          packageJsonPrTitle,
          dryRun
        );

        // Add package.json result to the main result
        result.packageJsonSync = packageJsonResult;

        if (packageJsonResult.success) {
          if (packageJsonResult.packageJson === 'unchanged') {
            core.info(`  📦 ${packageJsonResult.message}`);
          } else if (packageJsonResult.packageJson === 'pr-exists') {
            core.info(`  📦 ${packageJsonResult.message}`);
            if (packageJsonResult.prUrl) {
              core.info(`  🔗 PR URL: ${packageJsonResult.prUrl}`);
            }
          } else if (dryRun) {
            core.info(`  📦 ${packageJsonResult.message}`);
            if (packageJsonResult.changes) {
              for (const change of packageJsonResult.changes) {
                core.info(`     - Would update ${change.field}`);
              }
            }
          } else {
            core.info(`  📦 ${packageJsonResult.message}`);
            if (packageJsonResult.prUrl) {
              core.info(`  🔗 PR URL: ${packageJsonResult.prUrl}`);
            }
            if (packageJsonResult.changes) {
              for (const change of packageJsonResult.changes) {
                core.info(`     - Updated ${change.field}`);
              }
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
            if (dryRun) {
              core.info(`     ${settingName}: ${change.from} → ${change.to}`);
            } else {
              core.info(`     ${settingName}: ${change.from} → ${change.to}`);
            }
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

        // Log if no changes were needed
        if ((!result.changes || result.changes.length === 0) && !result.topicsChange && !result.codeScanningChange) {
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
