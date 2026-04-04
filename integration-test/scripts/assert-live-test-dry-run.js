import * as fs from 'fs';

import { assert, createOctokit, getFileContent, getRepository, info, readIntegrationConfig } from './helpers.js';

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

function readFixture(path) {
  return fs.readFileSync(path, 'utf8');
}

function assertPackageJsonChanges(repoFullName, changes, expectedChanges) {
  assert(Array.isArray(changes), `${repoFullName} package.json changes should be an array`);
  assert(changes.length === expectedChanges.length, `${repoFullName} package.json changes should have expected length`);

  for (const expectedChange of expectedChanges) {
    const actualChange = changes.find(change => change.field === expectedChange.field);
    assert(actualChange, `${repoFullName} package.json changes should include ${expectedChange.field}`);
    assert(
      actualChange.from === expectedChange.from,
      `${repoFullName} package.json ${expectedChange.field} change should report from=${expectedChange.from}`
    );
    assert(
      actualChange.to === expectedChange.to,
      `${repoFullName} package.json ${expectedChange.field} change should report to=${expectedChange.to}`
    );
  }
}

function assertSubResult(repoFullName, result, kind, status = 'changed') {
  assert(
    result.subResults?.some(subResult => subResult.kind === kind && subResult.status === status),
    `${repoFullName} should include a ${status} ${kind} sub-result`
  );
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();
    const results = parseResultsOutput();

    assert(repos.length === 3, 'dry-run config should include exactly three repositories');
    assert(parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') === 3, 'updated-repositories should equal 3');
    assert(parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') === 3, 'changed-repositories should equal 3');
    assert(parseIntegerOutput('ACTION_UNCHANGED_REPOSITORIES') === 0, 'unchanged-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_FAILED_REPOSITORIES') === 0, 'failed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_WARNING_REPOSITORIES') === 0, 'warning-repositories should equal 0');
    assert(results.length === 3, 'results output should include all configured repositories');

    const resultsByRepo = new Map(results.map(result => [result.repository, result]));

    for (const repoConfig of repos) {
      const repoFullName = repoConfig.repo;
      const result = resultsByRepo.get(repoFullName);
      assert(result, `Missing result entry for ${repoFullName}`);

      if (repoFullName.endsWith('/it-dry-run-a')) {
        const repository = await getRepository(octokit, repoFullName);
        assert(
          repository.allow_squash_merge === false,
          `${repoFullName} squash merge should remain disabled after dry-run`
        );
        assert(
          repository.allow_auto_merge === false,
          `${repoFullName} auto-merge should remain disabled after dry-run`
        );
        assert(
          repository.delete_branch_on_merge === false,
          `${repoFullName} delete-branch-on-merge should remain disabled after dry-run`
        );
        assert(result.success === true, `${repoFullName} result should be successful`);
        assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
        assertSubResult(repoFullName, result, 'settings');
      } else if (repoFullName.endsWith('/it-pr-dry-run-update-a')) {
        const branchContent = await getFileContent(
          octokit,
          repoFullName,
          '.github/dependabot.yml',
          'dependabot-yml-sync'
        );
        const staleContent = readFixture('integration-test/baselines/dependabot.stale.yml');
        assert(branchContent === staleContent, `${repoFullName} PR branch should remain stale after dry-run`);
        assert(
          result.dependabotSync?.dependabotYml === 'would-update-pr',
          `${repoFullName} should report would-update-pr`
        );
        assert(
          result.dependabotSync?.filesWouldUpdate?.length === 1 &&
            result.dependabotSync.filesWouldUpdate[0] === '.github/dependabot.yml',
          `${repoFullName} should report .github/dependabot.yml in filesWouldUpdate`
        );
        assertSubResult(repoFullName, result, 'dependabot-sync');
      } else if (repoFullName.endsWith('/it-pr-package-json-dry-run-update-a')) {
        const branchContent = await getFileContent(octokit, repoFullName, 'package.json', 'package-json-sync');
        const packageJson = JSON.parse(branchContent);
        assert(
          packageJson.scripts.test === 'node stale-test.js',
          `${repoFullName} PR branch should remain stale after dry-run`
        );
        assert(
          result.packageJsonSync?.packageJson === 'would-update-pr',
          `${repoFullName} should report would-update-pr`
        );
        assertPackageJsonChanges(repoFullName, result.packageJsonSync?.changes, [
          { field: 'scripts', from: 2, to: 2 },
          { field: 'engines', from: JSON.stringify({ node: '>=20' }), to: JSON.stringify({ node: '>=24' }) }
        ]);
        assertSubResult(repoFullName, result, 'package-json-sync');
      } else {
        throw new Error(`No dry-run assertion scenario configured for ${repoFullName}`);
      }
    }

    info('Live dry-run assertions passed.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
