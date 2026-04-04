import * as fs from 'fs';

import {
  assert,
  createOctokit,
  getFileContent,
  getCodeScanningDefaultSetupState,
  getDependabotAlertsEnabled,
  getDependabotSecurityUpdatesEnabled,
  getImmutableReleasesEnabled,
  getRulesetByName,
  getRepository,
  getTopics,
  info,
  listAutolinks,
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

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function readFixture(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

function assertPrMetadata(repoFullName, syncResult, pull) {
  assert(syncResult?.prNumber === pull.number, `${repoFullName} should report PR number ${pull.number}`);
  assert(syncResult?.prUrl === pull.html_url, `${repoFullName} should report PR URL ${pull.html_url}`);
}

function assertSortedStringArray(actual, expected, message) {
  assert(
    JSON.stringify(sortStrings(actual || [])) === JSON.stringify(sortStrings(expected)),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual || [])}`
  );
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

async function assertSinglePrFileSyncRepo(octokit, repoFullName, result, options) {
  const {
    branchName,
    targetPath,
    expectedContent,
    statusKey,
    statusProperty,
    expectedStatus = 'created',
    expectedSubResultKind
  } = options;
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, branchName);

  assert(pulls.length === 1, `${repoFullName} should have exactly one open PR for ${branchName}`);
  const branchContent = await getFileContent(octokit, repoFullName, targetPath, branchName);
  assert(branchContent === expectedContent, `${repoFullName} ${targetPath} on ${branchName} should match fixture`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result[statusKey]?.success === true, `${repoFullName} ${statusKey} should be successful`);
  assertPrMetadata(repoFullName, result[statusKey], pulls[0]);
  assertSortedStringArray(
    result[statusKey]?.filesProcessed,
    [targetPath],
    `${repoFullName} ${statusKey}.filesProcessed should match`
  );
  assert(
    result[statusKey]?.[statusProperty] === expectedStatus,
    `${repoFullName} ${statusKey}.${statusProperty} should report status ${expectedStatus}`
  );
  assertSubResult(repoFullName, result, expectedSubResultKind);

  if (expectedStatus === 'created') {
    assertSortedStringArray(
      result[statusKey]?.filesCreated,
      [targetPath],
      `${repoFullName} ${statusKey}.filesCreated should match`
    );
  } else if (expectedStatus === 'updated' || expectedStatus === 'pr-updated') {
    assertSortedStringArray(
      result[statusKey]?.filesUpdated,
      [targetPath],
      `${repoFullName} ${statusKey}.filesUpdated should match`
    );
  }
}

async function assertSettingsRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);

  assert(repository.allow_squash_merge === true, `${repoFullName} should have squash merge enabled`);
  assert(repository.allow_auto_merge === true, `${repoFullName} should have auto-merge enabled`);
  assert(repository.delete_branch_on_merge === true, `${repoFullName} should delete branches on merge`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assertSubResult(repoFullName, result, 'settings');
}

function assertChangedSetting(result, repoFullName, settingName) {
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(
    result.changes?.some(change => change.setting === settingName),
    `${repoFullName} should report a change for ${settingName}`
  );
}

async function assertMergeCommitRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);
  assert(repository.allow_merge_commit === false, `${repoFullName} should have merge commits disabled`);
  assertChangedSetting(result, repoFullName, 'allow_merge_commit');
  assertSubResult(repoFullName, result, 'settings');
}

async function assertRebaseMergeRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);
  assert(repository.allow_rebase_merge === true, `${repoFullName} should have rebase merge enabled`);
  assertChangedSetting(result, repoFullName, 'allow_rebase_merge');
  assertSubResult(repoFullName, result, 'settings');
}

async function assertUpdateBranchRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);
  assert(repository.allow_update_branch === true, `${repoFullName} should have update branch enabled`);
  assertChangedSetting(result, repoFullName, 'allow_update_branch');
  assertSubResult(repoFullName, result, 'settings');
}

async function assertImmutableReleasesRepo(octokit, repoFullName, result) {
  const enabled = await getImmutableReleasesEnabled(octokit, repoFullName);

  assert(enabled === true, `${repoFullName} immutable releases should be enabled`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.immutableReleasesChange?.to === true, `${repoFullName} should report immutable releases enabled`);
  assertSubResult(repoFullName, result, 'immutable-releases');
}

async function assertCodeScanningRepo(octokit, repoFullName, result) {
  const state = await getCodeScanningDefaultSetupState(octokit, repoFullName);

  assert(state === 'configured', `${repoFullName} code scanning should be configured`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.codeScanningChange?.to === 'configured', `${repoFullName} should report CodeQL configured`);
  assertSubResult(repoFullName, result, 'code-scanning');
}

async function assertSecretScanningRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);

  assert(
    repository.security_and_analysis?.secret_scanning?.status === 'enabled',
    `${repoFullName} secret scanning should be enabled`
  );
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.secretScanningChange?.to === true, `${repoFullName} should report secret scanning enabled`);
  assertSubResult(repoFullName, result, 'secret-scanning');
}

async function assertPushProtectionRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);

  assert(
    repository.security_and_analysis?.secret_scanning?.status === 'enabled',
    `${repoFullName} secret scanning should be enabled for push protection`
  );
  assert(
    repository.security_and_analysis?.secret_scanning_push_protection?.status === 'enabled',
    `${repoFullName} push protection should be enabled`
  );
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.secretScanningChange?.to === true, `${repoFullName} should report secret scanning enabled`);
  assert(
    result.secretScanningPushProtectionChange?.to === true,
    `${repoFullName} should report push protection enabled`
  );
  assertSubResult(repoFullName, result, 'secret-scanning');
  assertSubResult(repoFullName, result, 'push-protection');
}

async function assertDependabotAlertsRepo(octokit, repoFullName, result) {
  const enabled = await getDependabotAlertsEnabled(octokit, repoFullName);

  assert(enabled === true, `${repoFullName} Dependabot alerts should be enabled`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.dependabotAlertsChange?.to === true, `${repoFullName} should report Dependabot alerts enabled`);
  assertSubResult(repoFullName, result, 'dependabot-alerts');
}

async function assertDependabotSecurityUpdatesRepo(octokit, repoFullName, result) {
  const alertsEnabled = await getDependabotAlertsEnabled(octokit, repoFullName);
  const securityUpdatesEnabled = await getDependabotSecurityUpdatesEnabled(octokit, repoFullName);

  assert(alertsEnabled === true, `${repoFullName} Dependabot alerts should be enabled`);
  assert(securityUpdatesEnabled === true, `${repoFullName} Dependabot security updates should be enabled`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.dependabotAlertsChange?.to === true, `${repoFullName} should report Dependabot alerts enabled`);
  assert(
    result.dependabotSecurityUpdatesChange?.to === true,
    `${repoFullName} should report Dependabot security updates enabled`
  );
  assertSubResult(repoFullName, result, 'dependabot-alerts');
  assertSubResult(repoFullName, result, 'dependabot-security-updates');
}

async function assertDependabotYmlRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'dependabot-yml-sync',
    targetPath: '.github/dependabot.yml',
    expectedContent: readFixture('integration-test/sources/dependabot.yml'),
    statusKey: 'dependabotSync',
    statusProperty: 'dependabotYml',
    expectedSubResultKind: 'dependabot-sync'
  });
}

async function assertDependabotPrRepo(octokit, repoFullName, result, expectedStatus, expectedFixturePath) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'dependabot-yml-sync',
    targetPath: '.github/dependabot.yml',
    expectedContent: readFixture(expectedFixturePath),
    statusKey: 'dependabotSync',
    statusProperty: 'dependabotYml',
    expectedStatus,
    expectedSubResultKind: 'dependabot-sync'
  });
}

async function assertGitignoreRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'gitignore-sync',
    targetPath: '.gitignore',
    expectedContent: readFixture('integration-test/expected/gitignore'),
    statusKey: 'gitignoreSync',
    statusProperty: 'gitignore',
    expectedStatus: 'updated',
    expectedSubResultKind: 'gitignore-sync'
  });
}

async function assertRulesetsRepo(octokit, repoFullName, result) {
  const managedRuleset = await getRulesetByName(octokit, repoFullName, 'Integration Branch Protection');
  const obsoleteRuleset = await getRulesetByName(octokit, repoFullName, 'Obsolete Integration Ruleset');

  assert(managedRuleset, `${repoFullName} should have the managed ruleset`);
  assert(obsoleteRuleset === null, `${repoFullName} should not have the obsolete ruleset anymore`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.rulesetSync?.success === true, `${repoFullName} ruleset sync should be successful`);
  assert(result.rulesetSync?.ruleset === 'created', `${repoFullName} ruleset sync should report created`);
  assert(result.rulesetSync?.rulesetId === managedRuleset.id, `${repoFullName} should report managed ruleset ID`);
  assert(
    result.rulesetSync?.deletedRulesets?.some(
      ruleset => ruleset.name === 'Obsolete Integration Ruleset' && ruleset.deleted
    ),
    `${repoFullName} should report the obsolete ruleset as deleted`
  );
  assertSubResult(repoFullName, result, 'ruleset-sync');
}

async function assertPullRequestTemplateRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'pull-request-template-sync',
    targetPath: '.github/pull_request_template.md',
    expectedContent: readFixture('integration-test/sources/pull-request-template.md'),
    statusKey: 'pullRequestTemplateSync',
    statusProperty: 'pullRequestTemplate',
    expectedSubResultKind: 'pr-template-sync'
  });
}

async function assertWorkflowSingleRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'workflow-files-sync',
    targetPath: '.github/workflows/workflow-ci.yml',
    expectedContent: readFixture('integration-test/sources/workflow-ci.yml'),
    statusKey: 'workflowFilesSync',
    statusProperty: 'workflowFiles',
    expectedSubResultKind: 'workflow-files-sync'
  });
}

async function assertWorkflowFilesRepo(octokit, repoFullName, result) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'workflow-files-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open workflow files PR`);

  const ciContent = await getFileContent(
    octokit,
    repoFullName,
    '.github/workflows/workflow-ci.yml',
    'workflow-files-sync'
  );
  const releaseContent = await getFileContent(
    octokit,
    repoFullName,
    '.github/workflows/workflow-release.yml',
    'workflow-files-sync'
  );

  assert(
    ciContent === readFixture('integration-test/sources/workflow-ci.yml'),
    `${repoFullName} CI workflow should match fixture`
  );
  assert(
    releaseContent === readFixture('integration-test/sources/workflow-release.yml'),
    `${repoFullName} release workflow should match fixture`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.workflowFilesSync?.success === true, `${repoFullName} workflow files sync should be successful`);
  assertPrMetadata(repoFullName, result.workflowFilesSync, pulls[0]);
  assertSortedStringArray(
    result.workflowFilesSync?.filesProcessed,
    ['.github/workflows/workflow-ci.yml', '.github/workflows/workflow-release.yml'],
    `${repoFullName} workflow files sync should report both processed files`
  );
  assertSortedStringArray(
    result.workflowFilesSync?.filesCreated,
    ['.github/workflows/workflow-release.yml'],
    `${repoFullName} workflow files sync should report the created workflow file`
  );
  assertSortedStringArray(
    result.workflowFilesSync?.filesUpdated,
    ['.github/workflows/workflow-ci.yml'],
    `${repoFullName} workflow files sync should report the updated workflow file`
  );
  assert(
    result.workflowFilesSync?.workflowFiles === 'mixed',
    `${repoFullName} workflow files sync should report mixed`
  );
  assertSubResult(repoFullName, result, 'workflow-files-sync');
}

async function assertWorkflowPrRepo(octokit, repoFullName, result, expectedStatus) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'workflow-files-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open workflow files PR`);

  const ciContent = await getFileContent(
    octokit,
    repoFullName,
    '.github/workflows/workflow-ci.yml',
    'workflow-files-sync'
  );
  const releaseContent = await getFileContent(
    octokit,
    repoFullName,
    '.github/workflows/workflow-release.yml',
    'workflow-files-sync'
  );

  assert(
    ciContent === readFixture('integration-test/sources/workflow-ci.yml'),
    `${repoFullName} CI workflow should match fixture after PR sync handling`
  );
  assert(
    releaseContent === readFixture('integration-test/sources/workflow-release.yml'),
    `${repoFullName} release workflow should match fixture after PR sync handling`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.workflowFilesSync?.success === true, `${repoFullName} workflow files sync should be successful`);
  assertPrMetadata(repoFullName, result.workflowFilesSync, pulls[0]);
  assertSortedStringArray(
    result.workflowFilesSync?.filesProcessed,
    ['.github/workflows/workflow-ci.yml', '.github/workflows/workflow-release.yml'],
    `${repoFullName} workflow PR sync should report both processed files`
  );
  assert(
    result.workflowFilesSync?.workflowFiles === expectedStatus,
    `${repoFullName} workflow files sync should report ${expectedStatus}`
  );
  assertSubResult(repoFullName, result, 'workflow-files-sync');

  if (expectedStatus === 'pr-updated-created') {
    assertSortedStringArray(
      result.workflowFilesSync?.filesCreated,
      ['.github/workflows/workflow-release.yml'],
      `${repoFullName} workflow PR sync should report created files`
    );
  } else if (expectedStatus === 'pr-updated-mixed') {
    assertSortedStringArray(
      result.workflowFilesSync?.filesCreated,
      ['.github/workflows/workflow-release.yml'],
      `${repoFullName} workflow PR sync should report created files`
    );
    assertSortedStringArray(
      result.workflowFilesSync?.filesUpdated,
      ['.github/workflows/workflow-ci.yml'],
      `${repoFullName} workflow PR sync should report updated files`
    );
  }
}

async function assertAutolinksRepo(octokit, repoFullName, result) {
  const autolinks = await listAutolinks(octokit, repoFullName);
  const prefixes = autolinks.map(autolink => autolink.key_prefix);

  assert(prefixes.includes('ENG-'), `${repoFullName} should include ENG- autolink`);
  assert(!prefixes.includes('OLD-'), `${repoFullName} should not include OLD- autolink`);
  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.autolinksSync?.success === true, `${repoFullName} autolinks sync should be successful`);
  assert(result.autolinksSync?.autolinks === 'updated', `${repoFullName} autolinks sync should report updated`);
  assert(
    result.autolinksSync?.autolinksCreated?.includes('ENG-'),
    `${repoFullName} autolinks sync should report ENG- created`
  );
  assert(
    result.autolinksSync?.autolinksDeleted?.includes('OLD-'),
    `${repoFullName} autolinks sync should report OLD- deleted`
  );
  assert(result.autolinksSync?.autolinksUnchanged === 0, `${repoFullName} should report zero unchanged autolinks`);
  assertSubResult(repoFullName, result, 'autolinks-sync');
}

async function assertCopilotRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'copilot-instructions-md-sync',
    targetPath: '.github/copilot-instructions.md',
    expectedContent: readFixture('integration-test/sources/copilot-instructions.md'),
    statusKey: 'copilotInstructionsSync',
    statusProperty: 'copilotInstructions',
    expectedSubResultKind: 'copilot-instructions-sync'
  });
}

async function assertPackageJsonRepo(octokit, repoFullName, result, expectations) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'package-json-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open package.json PR`);

  const branchContent = await getFileContent(octokit, repoFullName, 'package.json', 'package-json-sync');
  const packageJson = JSON.parse(branchContent);

  assert(
    JSON.stringify(packageJson.scripts) === JSON.stringify(expectations.scripts),
    `${repoFullName} scripts should match expected package.json content`
  );
  assert(
    JSON.stringify(packageJson.engines) === JSON.stringify(expectations.engines),
    `${repoFullName} engines should match expected package.json content`
  );
  assert(packageJson.dependencies?.leftpad === '1.0.0', `${repoFullName} dependencies should be preserved`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.packageJsonSync?.success === true, `${repoFullName} package.json sync should be successful`);
  assert(result.packageJsonSync?.packageJson === 'updated', `${repoFullName} package.json sync should report updated`);
  assertPrMetadata(repoFullName, result.packageJsonSync, pulls[0]);

  assertPackageJsonChanges(repoFullName, result.packageJsonSync?.changes, expectations.changes);
  assertSubResult(repoFullName, result, 'package-json-sync');
}

async function assertPackageJsonPrRepo(octokit, repoFullName, result, expectations) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'package-json-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open package.json PR`);

  const branchContent = await getFileContent(octokit, repoFullName, 'package.json', 'package-json-sync');
  const packageJson = JSON.parse(branchContent);

  assert(
    JSON.stringify(packageJson.scripts) === JSON.stringify(expectations.scripts),
    `${repoFullName} scripts should match expected PR branch package.json content`
  );
  assert(
    JSON.stringify(packageJson.engines) === JSON.stringify(expectations.engines),
    `${repoFullName} engines should match expected PR branch package.json content`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(result.packageJsonSync?.success === true, `${repoFullName} package.json sync should be successful`);
  assertPrMetadata(repoFullName, result.packageJsonSync, pulls[0]);
  assert(
    result.packageJsonSync?.packageJson === expectations.status,
    `${repoFullName} package.json sync should report ${expectations.status}`
  );
  assertSubResult(repoFullName, result, 'package-json-sync');

  if (expectations.changes) {
    assertPackageJsonChanges(repoFullName, result.packageJsonSync?.changes, expectations.changes);
  }
}

async function assertCodeownersRootRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'codeowners-sync',
    targetPath: 'CODEOWNERS',
    expectedContent: readFixture('integration-test/sources/CODEOWNERS'),
    statusKey: 'codeownersSync',
    statusProperty: 'codeowners',
    expectedSubResultKind: 'codeowners-sync'
  });
}

async function assertCodeownersVarsRepo(octokit, repoFullName, result) {
  const [owner] = repoFullName.split('/');
  const expectedContent = readFixture('integration-test/expected/CODEOWNERS.vars').replaceAll(
    '__LIVE_TEST_ORG__',
    owner
  );

  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'codeowners-sync',
    targetPath: '.github/CODEOWNERS',
    expectedContent,
    statusKey: 'codeownersSync',
    statusProperty: 'codeowners',
    expectedSubResultKind: 'codeowners-sync'
  });
}

async function assertCodeownersDocsRepo(octokit, repoFullName, result) {
  await assertSinglePrFileSyncRepo(octokit, repoFullName, result, {
    branchName: 'codeowners-sync',
    targetPath: 'docs/CODEOWNERS',
    expectedContent: readFixture('integration-test/sources/CODEOWNERS'),
    statusKey: 'codeownersSync',
    statusProperty: 'codeowners',
    expectedSubResultKind: 'codeowners-sync'
  });
}

async function assertTopicsRepo(octokit, repoFullName, result) {
  const topics = await getTopics(octokit, repoFullName);
  const expectedTopics = ['integration-live', 'topics-check'];

  assert(
    JSON.stringify(sortStrings(topics)) === JSON.stringify(sortStrings(expectedTopics)),
    `${repoFullName} topics should be ${expectedTopics.join(', ')}`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assertSubResult(repoFullName, result, 'topics');
}

async function assertCodeownersRepo(octokit, repoFullName, result) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'codeowners-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open CODEOWNERS PR`);

  const branchContent = await getFileContent(octokit, repoFullName, '.github/CODEOWNERS', 'codeowners-sync');
  const expectedContent = fs.readFileSync('integration-test/sources/CODEOWNERS', 'utf8');

  assert(branchContent === expectedContent, `${repoFullName} CODEOWNERS content on PR branch should match fixture`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assertSubResult(repoFullName, result, 'codeowners-sync');
}

async function assertWarningRepo(octokit, repoFullName, result) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'codeowners-sync');
  assert(pulls.length === 0, `${repoFullName} should not have an open CODEOWNERS PR`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === true, `${repoFullName} should have warnings`);
  assert(result.codeownersSyncWarning, `${repoFullName} should expose a CODEOWNERS warning`);
  assertSubResult(repoFullName, result, 'codeowners-sync', 'warning');
}

async function assertUnchangedRepo(octokit, repoFullName, result) {
  const topics = await getTopics(octokit, repoFullName);
  const expectedTopics = ['unchanged-live', 'stable-check'];

  assert(
    JSON.stringify(sortStrings(topics)) === JSON.stringify(sortStrings(expectedTopics)),
    `${repoFullName} topics should remain ${expectedTopics.join(', ')}`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert((result.subResults?.length ?? 0) === 0, `${repoFullName} should not report any sub-results`);
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();
    const results = parseResultsOutput();

    assert(parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') === 34, 'updated-repositories should equal 34');
    assert(parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') === 32, 'changed-repositories should equal 32');
    assert(parseIntegerOutput('ACTION_UNCHANGED_REPOSITORIES') === 2, 'unchanged-repositories should equal 2');
    assert(parseIntegerOutput('ACTION_FAILED_REPOSITORIES') === 0, 'failed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_WARNING_REPOSITORIES') === 1, 'warning-repositories should equal 1');
    assert(results.length === repos.length, 'results output should include every configured repository');

    const resultsByRepo = new Map(results.map(result => [result.repository, result]));

    for (const repoConfig of repos) {
      const result = resultsByRepo.get(repoConfig.repo);
      assert(result, `Missing result entry for ${repoConfig.repo}`);

      if (repoConfig.repo.endsWith('/it-settings-a')) {
        await assertSettingsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-merge-commit-a')) {
        await assertMergeCommitRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-rebase-merge-a')) {
        await assertRebaseMergeRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-update-branch-a')) {
        await assertUpdateBranchRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-immutable-releases-a')) {
        await assertImmutableReleasesRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-code-scanning-a')) {
        await assertCodeScanningRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-secret-scanning-a')) {
        await assertSecretScanningRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-push-protection-a')) {
        await assertPushProtectionRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-dependabot-alerts-a')) {
        await assertDependabotAlertsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-dependabot-security-updates-a')) {
        await assertDependabotSecurityUpdatesRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-dependabot-yml-a')) {
        await assertDependabotYmlRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-gitignore-a')) {
        await assertGitignoreRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-rulesets-a')) {
        await assertRulesetsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-pull-request-template-a')) {
        await assertPullRequestTemplateRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-workflow-single-a')) {
        await assertWorkflowSingleRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-workflows-a')) {
        await assertWorkflowFilesRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-autolinks-a')) {
        await assertAutolinksRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-copilot-a')) {
        await assertCopilotRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-package-json-a')) {
        await assertPackageJsonRepo(octokit, repoConfig.repo, result, {
          scripts: {
            lint: 'eslint .',
            test: 'npm run lint && node --test'
          },
          engines: {
            node: '>=24'
          },
          changes: [
            { field: 'scripts', from: 2, to: 2 },
            { field: 'engines', from: JSON.stringify({ node: '>=20' }), to: JSON.stringify({ node: '>=24' }) }
          ]
        });
      } else if (repoConfig.repo.endsWith('/it-package-json-scripts-a')) {
        await assertPackageJsonRepo(octokit, repoConfig.repo, result, {
          scripts: {
            lint: 'eslint .',
            test: 'npm run lint && node --test'
          },
          engines: {
            node: '>=24'
          },
          changes: [{ field: 'scripts', from: 2, to: 2 }]
        });
      } else if (repoConfig.repo.endsWith('/it-package-json-engines-a')) {
        await assertPackageJsonRepo(octokit, repoConfig.repo, result, {
          scripts: {
            lint: 'eslint .',
            test: 'npm run lint && node --test'
          },
          engines: {
            node: '>=24'
          },
          changes: [{ field: 'engines', from: JSON.stringify({ node: '>=18' }), to: JSON.stringify({ node: '>=24' }) }]
        });
      } else if (repoConfig.repo.endsWith('/it-codeowners-root-a')) {
        await assertCodeownersRootRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-codeowners-docs-a')) {
        await assertCodeownersDocsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-codeowners-vars-a')) {
        await assertCodeownersVarsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-pr-up-to-date-a')) {
        await assertDependabotPrRepo(
          octokit,
          repoConfig.repo,
          result,
          'pr-up-to-date',
          'integration-test/sources/dependabot.yml'
        );
      } else if (repoConfig.repo.endsWith('/it-pr-updated-a')) {
        await assertDependabotPrRepo(
          octokit,
          repoConfig.repo,
          result,
          'pr-updated',
          'integration-test/sources/dependabot.yml'
        );
      } else if (repoConfig.repo.endsWith('/it-pr-workflows-created-a')) {
        await assertWorkflowPrRepo(octokit, repoConfig.repo, result, 'pr-updated-created');
      } else if (repoConfig.repo.endsWith('/it-pr-workflows-mixed-a')) {
        await assertWorkflowPrRepo(octokit, repoConfig.repo, result, 'pr-updated-mixed');
      } else if (repoConfig.repo.endsWith('/it-pr-package-json-up-to-date-a')) {
        await assertPackageJsonPrRepo(octokit, repoConfig.repo, result, {
          scripts: {
            lint: 'eslint .',
            test: 'npm run lint && node --test'
          },
          engines: {
            node: '>=24'
          },
          status: 'pr-up-to-date'
        });
      } else if (repoConfig.repo.endsWith('/it-pr-package-json-updated-a')) {
        await assertPackageJsonPrRepo(octokit, repoConfig.repo, result, {
          scripts: {
            lint: 'eslint .',
            test: 'npm run lint && node --test'
          },
          engines: {
            node: '>=24'
          },
          status: 'pr-updated',
          changes: [
            { field: 'scripts', from: 2, to: 2 },
            { field: 'engines', from: JSON.stringify({ node: '>=20' }), to: JSON.stringify({ node: '>=24' }) }
          ]
        });
      } else if (repoConfig.repo.endsWith('/it-topics-a')) {
        await assertTopicsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-codeowners-a')) {
        await assertCodeownersRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-warning-a')) {
        await assertWarningRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-unchanged-a')) {
        await assertUnchangedRepo(octokit, repoConfig.repo, result);
      } else {
        throw new Error(`No assertion scenario configured for ${repoConfig.repo}`);
      }
    }

    info('Live integration assertions passed.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
