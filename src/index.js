/**
 * Hello World GitHub Action
 * A simple template action that demonstrates common patterns and best practices
 *
 * Local Development & Testing:
 *
 * 1. Set environment variables to simulate GitHub Actions inputs:
 *    export INPUT_WHO_TO_GREET="Local Developer"
 *    export INPUT_INCLUDE_TIME="true"
 *    export INPUT_MESSAGE_PREFIX="Hey"
 *    export INPUT_GITHUB_TOKEN="ghp_your_token_here"  # Optional, for repo stats
 *
 * 2. Set GitHub context environment variables (optional, for repo stats):
 *    export GITHUB_REPOSITORY="owner/repo-name"
 *    export GITHUB_REF="refs/heads/main"
 *    export GITHUB_SHA="abc123..."
 *
 * 3. Run locally:
 *    node src/index.js
 *
 * Example one-liner for testing:
 *    INPUT_WHO_TO_GREET="Local Dev" INPUT_INCLUDE_TIME="true" INPUT_MESSAGE_PREFIX="Hi" node src/index.js
 *
 * Note: Without GITHUB_REPOSITORY set, repo stats won't be fetched even with a token
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';

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
 * @returns {boolean} Boolean value
 */
function getBooleanInput(name) {
  const input = getInput(name).toLowerCase();
  return input === 'true' || input === '1' || input === 'yes';
}

/**
 * Get current timestamp in ISO format
 * @returns {string} Current timestamp
 */
export function getCurrentTime() {
  return new Date().toISOString();
}

/**
 * Create a greeting message
 * @param {string} prefix - Message prefix (e.g., "Hello")
 * @param {string} name - Name to greet
 * @returns {string} Formatted greeting
 */
export function createGreeting(prefix, name) {
  return `${prefix}, ${name}!`;
}

/**
 * Fetch repository statistics using GitHub API
 * @param {string} token - GitHub token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Object} Repository statistics
 */
export async function getRepoStats(token, owner, repo) {
  try {
    const octokit = new Octokit({ auth: token });

    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo
    });

    return {
      name: repoData.full_name,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      issues: repoData.open_issues_count,
      language: repoData.language,
      size: repoData.size,
      created: repoData.created_at,
      updated: repoData.updated_at
    };
  } catch (error) {
    core.warning(`Failed to fetch repository stats: ${error.message}`);
    return null;
  }
}

/**
 * Main action logic
 */
export async function run() {
  try {
    // Get inputs from action.yml
    const whoToGreet = getInput('who-to-greet') || 'World';
    const includeTime = getBooleanInput('include-time');
    const messagePrefix = getInput('message-prefix') || 'Hello';
    const githubToken = getInput('github-token');

    core.info(`Starting Hello World Action...`);
    core.info(`Who to greet: ${whoToGreet}`);
    core.info(`Message prefix: ${messagePrefix}`);
    core.info(`Include time: ${includeTime}`);
    core.info(`GitHub token provided: ${githubToken ? 'Yes' : 'No'}`);

    // Create the greeting message
    const greeting = createGreeting(messagePrefix, whoToGreet);

    // Log the greeting
    core.info(`Generated greeting: ${greeting}`);

    // Set the greeting as an output
    core.setOutput('message', greeting);

    // Optionally include timestamp
    let currentTime = null;
    if (includeTime) {
      currentTime = getCurrentTime();
      core.info(`Current time: ${currentTime}`);
      core.setOutput('time', currentTime);
    }

    // Optionally fetch repository stats if token is provided
    let repoStats = null;
    if (githubToken && github.context.repo.owner && github.context.repo.repo) {
      core.info('Fetching repository statistics...');
      repoStats = await getRepoStats(githubToken, github.context.repo.owner, github.context.repo.repo);

      if (repoStats) {
        core.info(`Repository: ${repoStats.name}`);
        core.info(`⭐ Stars: ${repoStats.stars}`);
        core.info(`🍴 Forks: ${repoStats.forks}`);
        core.info(`🐛 Open Issues: ${repoStats.issues}`);
        core.info(`📝 Language: ${repoStats.language || 'Unknown'}`);

        core.setOutput('repo-stats', JSON.stringify(repoStats));
      }
    }

    // Example of setting a secret (this won't be logged)
    core.setSecret('my-secret-value');

    // Create enhanced summary with repo stats if available
    const summaryTable = [
      [
        { data: 'Field', header: true },
        { data: 'Value', header: true }
      ],
      ['Greeting', greeting],
      ...(includeTime ? [['Timestamp', currentTime]] : []),
      ...(repoStats
        ? [
            ['Repository', repoStats.name],
            ['⭐ Stars', repoStats.stars.toString()],
            ['🍴 Forks', repoStats.forks.toString()],
            ['🐛 Open Issues', repoStats.issues.toString()],
            ['📝 Language', repoStats.language || 'Unknown']
          ]
        : [])
    ];

    // Create summary (only works in GitHub Actions environment)
    try {
      await core.summary.addHeading('Hello World Action Results').addTable(summaryTable).write();
    } catch {
      // Fallback: write table to console for local development
      core.info('📊 Hello World Action Results:');
      for (const [field, value] of summaryTable.slice(1)) {
        core.info(`   ${field}: ${value}`);
      }
    }

    core.info('✅ Action completed successfully!');
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
