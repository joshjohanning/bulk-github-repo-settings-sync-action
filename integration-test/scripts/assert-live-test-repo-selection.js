import { assert, createOctokit, getRepository, getRequiredEnv, getTopics, info } from './helpers.js';

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

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertTopics(topics, expectedTopics, repoFullName) {
  assert(
    JSON.stringify(sortStrings(topics)) === JSON.stringify(sortStrings(expectedTopics)),
    `${repoFullName} topics should equal ${expectedTopics.join(', ')}`
  );
}

function getScenarioConfig(org) {
  return {
    'selection-list': {
      selectedRepos: [`${org}/it-select-list-a`, `${org}/it-select-list-b`],
      untouchedRepos: [`${org}/it-select-list-c`],
      expectedTopics: ['selection-list'],
      expectExactCounts: true,
      expectedUpdated: 2,
      expectedChanged: 2,
      expectedUnchanged: 0
    },
    'selection-all': {
      selectedRepos: [`${org}/it-select-all-a`, `${org}/it-select-all-b`, `${org}/it-select-all-c`],
      untouchedRepos: [],
      expectedTopics: ['selection-all'],
      expectExactCounts: false
    },
    'selection-custom-property': {
      selectedRepos: [`${org}/it-select-prop-a`, `${org}/it-select-prop-b`],
      untouchedRepos: [`${org}/it-select-prop-c`],
      expectedTopics: ['selection-custom-property'],
      expectExactCounts: true,
      expectedUpdated: 2,
      expectedChanged: 2,
      expectedUnchanged: 0
    },
    'selection-rules-repos': {
      selectedRepos: [`${org}/it-select-rules-a`, `${org}/it-select-rules-b`],
      untouchedRepos: [`${org}/it-select-rules-c`],
      expectExactCounts: true,
      expectedUpdated: 2,
      expectedChanged: 2,
      expectedUnchanged: 0
    },
    'selection-rules-all-and-property': {
      selectedRepos: [`${org}/it-select-rules-all-a`, `${org}/it-select-rules-all-b`, `${org}/it-select-rules-all-c`],
      untouchedRepos: [],
      expectExactCounts: false
    }
  };
}

async function assertResultPresence(resultsByRepo, repos) {
  for (const repoFullName of repos) {
    const result = resultsByRepo.get(repoFullName);
    assert(result, `Missing result entry for ${repoFullName}`);
    assert(result.success === true, `${repoFullName} result should be successful`);
    assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  }
}

async function main() {
  try {
    const octokit = createOctokit();
    const org = getRequiredEnv('LIVE_TEST_ORG');
    const scenarioName = getRequiredEnv('SELECTION_SCENARIO');
    const scenario = getScenarioConfig(org)[scenarioName];
    assert(scenario, `Unknown repo selection scenario: ${scenarioName}`);

    const results = parseResultsOutput();
    const resultsByRepo = new Map(results.map(result => [result.repository, result]));

    assert(parseIntegerOutput('ACTION_FAILED_REPOSITORIES') === 0, 'failed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_WARNING_REPOSITORIES') === 0, 'warning-repositories should equal 0');

    if (scenario.expectExactCounts) {
      assert(
        parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') === scenario.expectedUpdated,
        `updated-repositories should equal ${scenario.expectedUpdated}`
      );
      assert(
        parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') === scenario.expectedChanged,
        `changed-repositories should equal ${scenario.expectedChanged}`
      );
      assert(
        parseIntegerOutput('ACTION_UNCHANGED_REPOSITORIES') === scenario.expectedUnchanged,
        `unchanged-repositories should equal ${scenario.expectedUnchanged}`
      );
      assert(
        results.length === scenario.expectedUpdated,
        `results output should include ${scenario.expectedUpdated} repositories`
      );
    } else {
      assert(
        parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') >= scenario.selectedRepos.length,
        'updated-repositories should include the dedicated selection repos'
      );
      assert(
        parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') >= scenario.selectedRepos.length,
        'changed-repositories should include the dedicated selection repos'
      );
    }

    await assertResultPresence(resultsByRepo, scenario.selectedRepos);

    if (scenarioName === 'selection-list' || scenarioName === 'selection-custom-property') {
      for (const repoFullName of scenario.selectedRepos) {
        const topics = await getTopics(octokit, repoFullName);
        assertTopics(topics, scenario.expectedTopics, repoFullName);
      }
      for (const repoFullName of scenario.untouchedRepos) {
        const topics = await getTopics(octokit, repoFullName);
        assertTopics(topics, [], repoFullName);
      }
    } else if (scenarioName === 'selection-all') {
      for (const repoFullName of scenario.selectedRepos) {
        const topics = await getTopics(octokit, repoFullName);
        assertTopics(topics, scenario.expectedTopics, repoFullName);
      }
    } else if (scenarioName === 'selection-rules-repos') {
      const repoA = `${org}/it-select-rules-a`;
      const repoB = `${org}/it-select-rules-b`;
      const repoC = `${org}/it-select-rules-c`;

      assertTopics(await getTopics(octokit, repoA), ['selection-rules-base'], repoA);
      assertTopics(await getTopics(octokit, repoB), ['selection-rules-override'], repoB);
      assertTopics(await getTopics(octokit, repoC), [], repoC);

      const repositoryA = await getRepository(octokit, repoA);
      const repositoryB = await getRepository(octokit, repoB);
      const repositoryC = await getRepository(octokit, repoC);

      assert(repositoryA.allow_update_branch === true, `${repoA} should have update branch enabled`);
      assert(repositoryA.delete_branch_on_merge === false, `${repoA} should keep delete-branch-on-merge disabled`);
      assert(repositoryB.allow_update_branch === true, `${repoB} should have update branch enabled`);
      assert(repositoryB.delete_branch_on_merge === true, `${repoB} should have delete-branch-on-merge enabled`);
      assert(repositoryC.allow_update_branch === false, `${repoC} should keep update branch disabled`);
      assert(repositoryC.delete_branch_on_merge === false, `${repoC} should keep delete-branch-on-merge disabled`);
    } else if (scenarioName === 'selection-rules-all-and-property') {
      const repoA = `${org}/it-select-rules-all-a`;
      const repoB = `${org}/it-select-rules-all-b`;
      const repoC = `${org}/it-select-rules-all-c`;

      assertTopics(await getTopics(octokit, repoA), ['selection-rules-all', 'selection-rules-property'], repoA);
      assertTopics(await getTopics(octokit, repoB), ['selection-rules-all', 'selection-rules-property'], repoB);
      assertTopics(await getTopics(octokit, repoC), ['selection-rules-all'], repoC);

      const repositoryA = await getRepository(octokit, repoA);
      const repositoryB = await getRepository(octokit, repoB);
      const repositoryC = await getRepository(octokit, repoC);

      assert(repositoryA.allow_auto_merge === true, `${repoA} should have auto-merge enabled`);
      assert(repositoryB.allow_auto_merge === true, `${repoB} should have auto-merge enabled`);
      assert(repositoryC.allow_auto_merge === false, `${repoC} should keep auto-merge disabled`);
    } else {
      throw new Error(`No repo selection assertions configured for ${scenarioName}`);
    }

    info(`Repo selection assertions passed for ${scenarioName}.`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
