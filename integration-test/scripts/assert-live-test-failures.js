import {
  assert,
  createOctokit,
  getRepository,
  info,
  listOpenPullRequestsForBranch,
  readIntegrationConfig
} from './helpers.js';

function parseIntegerOutput(name) {
  const value = process.env[name];
  assert(value !== undefined, `Missing action output env: ${name}`);
  const parsed = Number.parseInt(value, 10);
  assert(Number.isInteger(parsed), `Expected integer in ${name}, got: ${value}`);
  return parsed;
}

function parseResultsOutput() {
  const raw = process.env.ACTION_RESULTS;
  assert(raw, 'Missing ACTION_RESULTS output');
  return JSON.parse(raw);
}

async function assertNoPr(octokit, repoFullName, branchName) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, branchName);
  assert(pulls.length === 0, `${repoFullName} should not have an open PR for ${branchName}`);
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();
    const results = parseResultsOutput();

    assert(repos.length === 7, 'failure config should include exactly seven repositories');
    assert(parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') === 7, 'updated-repositories should equal 7');
    assert(parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') === 0, 'changed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_UNCHANGED_REPOSITORIES') === 7, 'unchanged-repositories should equal 7');
    assert(parseIntegerOutput('ACTION_FAILED_REPOSITORIES') === 0, 'failed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_WARNING_REPOSITORIES') === 6, 'warning-repositories should equal 6');
    assert(results.length === 7, 'results output should include every configured repository');

    const resultsByRepo = new Map(results.map(result => [result.repository, result]));

    for (const repoConfig of repos) {
      const repoFullName = repoConfig.repo;
      const result = resultsByRepo.get(repoFullName);
      assert(result, `Missing result entry for ${repoFullName}`);

      if (repoFullName.endsWith('/it-archived-a')) {
        const repository = await getRepository(octokit, repoFullName);
        assert(repository.archived === true, `${repoFullName} should be archived`);
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
        assert(result.archived === true, `${repoFullName} should be reported as archived`);
      } else if (repoFullName.endsWith('/it-invalid-codeowners-path-a')) {
        await assertNoPr(octokit, repoFullName, 'codeowners-sync');
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.codeownersSyncWarning?.includes('Invalid CODEOWNERS target path: invalid/CODEOWNERS'),
          `${repoFullName} should report invalid CODEOWNERS target path`
        );
      } else if (repoFullName.endsWith('/it-invalid-autolinks-file-a')) {
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.autolinksSyncWarning?.includes('Failed to read or parse autolinks file'),
          `${repoFullName} should report invalid autolinks file`
        );
      } else if (repoFullName.endsWith('/it-invalid-rulesets-file-a')) {
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.rulesetSyncWarning?.includes('Failed to read or parse ruleset file'),
          `${repoFullName} should report invalid ruleset file`
        );
      } else if (repoFullName.endsWith('/it-invalid-package-json-file-a')) {
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.packageJsonSyncWarning?.includes('Failed to read or parse package.json file'),
          `${repoFullName} should report invalid package.json source file`
        );
      } else if (repoFullName.endsWith('/it-missing-package-json-a')) {
        await assertNoPr(octokit, repoFullName, 'package-json-sync');
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.packageJsonSyncWarning?.includes('package.json does not exist'),
          `${repoFullName} should report missing target package.json`
        );
      } else if (repoFullName.endsWith('/it-invalid-workflows-file-a')) {
        await assertNoPr(octokit, repoFullName, 'workflow-files-sync');
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
        assert(
          result.workflowFilesSyncWarning?.includes('Failed to read file at'),
          `${repoFullName} should report invalid workflow file path`
        );
      } else {
        throw new Error(`No failure assertion scenario configured for ${repoFullName}`);
      }
    }

    info('Live failure-scenario assertions passed.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
