import * as fs from 'fs';

import {
  createAutolink,
  createPullRequest,
  createRuleset,
  createOctokit,
  deleteBranchIfExists,
  deleteFileIfExists,
  deleteAutolinkIfExistsByPrefix,
  deleteRulesetIfExistsByName,
  ensureBranchFromDefault,
  ensureOrgCustomProperty,
  ensureRepositoryExists,
  setCodeScanningDefaultSetupState,
  setDependabotAlertsEnabled,
  setDependabotSecurityUpdatesEnabled,
  setImmutableReleasesEnabled,
  setOrgCustomPropertyValues,
  setRepositoryArchived,
  setSecurityAndAnalysis,
  info,
  listOpenPullRequestsForBranch,
  paceMutation,
  putFileContent,
  readIntegrationConfig,
  replaceTopics,
  updateRepositorySettings,
  closePullRequest
} from './helpers.js';

function readFixture(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

function readJsonFixture(relativePath) {
  return JSON.parse(readFixture(relativePath));
}

const SELECTION_CUSTOM_PROPERTIES = {
  live_test_selector: {
    description: 'Live integration selector property',
    repos: {
      'it-select-prop-a': 'blue',
      'it-select-prop-b': 'green',
      'it-select-prop-c': 'ignore'
    }
  },
  live_test_rules_selector: {
    description: 'Live integration rules selector property',
    repos: {
      'it-select-rules-all-a': 'blue',
      'it-select-rules-all-b': 'green',
      'it-select-rules-all-c': 'ignore'
    }
  }
};

async function resetPrSyncRepo(octokit, repoFullName, branchName, files = []) {
  const repository = await ensureRepositoryExists(octokit, repoFullName);
  const defaultBranch = repository.default_branch;
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, branchName);

  for (const pull of pulls) {
    info(`Closing existing PR #${pull.number} for ${repoFullName}`);
    await closePullRequest(octokit, repoFullName, pull.number);
  }

  await deleteBranchIfExists(octokit, repoFullName, branchName);

  for (const filePath of files) {
    await deleteFileIfExists(octokit, repoFullName, filePath, defaultBranch);
  }

  await paceMutation();
  return defaultBranch;
}

async function seedOpenPr(octokit, repoFullName, { branchName, title, filesOnBranch }) {
  const defaultBranch = await ensureBranchFromDefault(octokit, repoFullName, branchName);

  for (const file of filesOnBranch) {
    await putFileContent(
      octokit,
      repoFullName,
      file.path,
      file.content,
      branchName,
      file.message || `chore: seed ${file.path} for integration`
    );
  }

  await createPullRequest(octokit, repoFullName, {
    title,
    head: branchName,
    base: defaultBranch,
    body: 'Seed PR for live integration testing.'
  });
}

async function resetSettingsRepo(octokit, repoFullName) {
  info(`Resetting settings baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_squash_merge: false,
    allow_auto_merge: false,
    delete_branch_on_merge: false
  });
}

async function resetTopicsRepo(octokit, repoFullName) {
  info(`Resetting topics baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await replaceTopics(octokit, repoFullName, []);
}

async function resetUnchangedRepo(octokit, repoFullName) {
  info(`Resetting unchanged baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await replaceTopics(octokit, repoFullName, ['unchanged-live', 'stable-check']);
}

async function resetCodeownersRepo(octokit, repoFullName) {
  info(`Resetting CODEOWNERS baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'codeowners-sync', ['.github/CODEOWNERS']);
}

async function resetDryRunRepo(octokit, repoFullName) {
  info(`Resetting dry-run baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_squash_merge: false,
    allow_auto_merge: false,
    delete_branch_on_merge: false
  });
}

async function resetSelectionRepo(octokit, repoFullName) {
  info(`Resetting repo selection baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await replaceTopics(octokit, repoFullName, []);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_squash_merge: false,
    allow_auto_merge: false,
    delete_branch_on_merge: false,
    allow_update_branch: false
  });
}

async function resetArchivedRepo(octokit, repoFullName) {
  info(`Resetting archived baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setRepositoryArchived(octokit, repoFullName, false);
  await replaceTopics(octokit, repoFullName, []);
  await setRepositoryArchived(octokit, repoFullName, true);
}

async function resetInvalidCodeownersPathRepo(octokit, repoFullName) {
  info(`Resetting invalid CODEOWNERS target baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'codeowners-sync', [
    '.github/CODEOWNERS',
    'CODEOWNERS',
    'docs/CODEOWNERS'
  ]);
}

async function resetInvalidWorkflowFilesRepo(octokit, repoFullName) {
  info(`Resetting invalid workflow files baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'workflow-files-sync', ['.github/workflows/DOES-NOT-EXIST.yml']);
}

async function resetMissingPackageJsonRepo(octokit, repoFullName) {
  info(`Resetting missing package.json baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'package-json-sync', ['package.json']);
}

async function resetSelectionCustomProperties(octokit, repos) {
  const selectionRepoNames = repos.map(repoConfig => repoConfig.repo);
  if (selectionRepoNames.length === 0) {
    return;
  }

  const org = selectionRepoNames[0].split('/')[0];

  for (const [propertyName, propertyConfig] of Object.entries(SELECTION_CUSTOM_PROPERTIES)) {
    const propertyRepos = selectionRepoNames.filter(repoFullName => {
      const repoName = repoFullName.split('/')[1];
      return repoName && propertyConfig.repos[repoName] !== undefined;
    });

    if (propertyRepos.length === 0) {
      continue;
    }

    await ensureOrgCustomProperty(octokit, org, propertyName, {
      value_type: 'single_select',
      allowed_values: ['blue', 'green', 'ignore'],
      description: propertyConfig.description,
      required: false,
      values_editable_by: 'org_actors',
      require_explicit_values: false
    });

    const reposByValue = new Map();
    for (const repoFullName of propertyRepos) {
      const repoName = repoFullName.split('/')[1];
      const value = propertyConfig.repos[repoName];
      const names = reposByValue.get(value) || [];
      names.push(repoName);
      reposByValue.set(value, names);
    }

    for (const [value, repositoryNames] of reposByValue.entries()) {
      await setOrgCustomPropertyValues(octokit, org, repositoryNames, [
        {
          property_name: propertyName,
          value
        }
      ]);
    }
  }
}

async function resetMergeCommitRepo(octokit, repoFullName) {
  info(`Resetting merge commit baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_merge_commit: true
  });
}

async function resetRebaseMergeRepo(octokit, repoFullName) {
  info(`Resetting rebase merge baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_rebase_merge: false
  });
}

async function resetUpdateBranchRepo(octokit, repoFullName) {
  info(`Resetting update branch baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_update_branch: false
  });
}

async function resetImmutableReleasesRepo(octokit, repoFullName) {
  info(`Resetting immutable releases baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setImmutableReleasesEnabled(octokit, repoFullName, false);
}

async function resetCodeScanningRepo(octokit, repoFullName) {
  info(`Resetting code scanning baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setCodeScanningDefaultSetupState(octokit, repoFullName, 'not-configured');
}

async function resetSecretScanningRepo(octokit, repoFullName) {
  info(`Resetting secret scanning baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setSecurityAndAnalysis(octokit, repoFullName, {
    secret_scanning: { status: 'disabled' },
    secret_scanning_push_protection: { status: 'disabled' }
  });
}

async function resetDependabotAlertsRepo(octokit, repoFullName) {
  info(`Resetting Dependabot alerts baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setDependabotAlertsEnabled(octokit, repoFullName, false);
}

async function resetDependabotSecurityUpdatesRepo(octokit, repoFullName) {
  info(`Resetting Dependabot security updates baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  await setDependabotSecurityUpdatesEnabled(octokit, repoFullName, false);
  await setDependabotAlertsEnabled(octokit, repoFullName, false);
}

async function resetDependabotYmlRepo(octokit, repoFullName) {
  info(`Resetting dependabot.yml baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'dependabot-yml-sync', ['.github/dependabot.yml']);
}

async function resetGitignoreRepo(octokit, repoFullName) {
  info(`Resetting .gitignore baseline for ${repoFullName}`);
  const defaultBranch = await resetPrSyncRepo(octokit, repoFullName, 'gitignore-sync');
  await putFileContent(
    octokit,
    repoFullName,
    '.gitignore',
    readFixture('integration-test/baselines/gitignore'),
    defaultBranch,
    'chore: reset .gitignore for integration'
  );
}

async function resetRulesetsRepo(octokit, repoFullName) {
  info(`Resetting rulesets baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  const obsoleteRuleset = readJsonFixture('integration-test/baselines/obsolete-ruleset.json');
  await deleteRulesetIfExistsByName(octokit, repoFullName, 'Integration Branch Protection');
  await deleteRulesetIfExistsByName(octokit, repoFullName, obsoleteRuleset.name);
  await createRuleset(octokit, repoFullName, obsoleteRuleset);
}

async function resetPullRequestTemplateRepo(octokit, repoFullName) {
  info(`Resetting pull request template baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'pull-request-template-sync', ['.github/pull_request_template.md']);
}

async function resetWorkflowSingleRepo(octokit, repoFullName) {
  info(`Resetting single workflow baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'workflow-files-sync', [
    '.github/workflows/workflow-ci.yml',
    '.github/workflows/workflow-release.yml'
  ]);
}

async function resetWorkflowFilesRepo(octokit, repoFullName) {
  info(`Resetting workflow files baseline for ${repoFullName}`);
  const defaultBranch = await resetPrSyncRepo(octokit, repoFullName, 'workflow-files-sync', [
    '.github/workflows/workflow-ci.yml',
    '.github/workflows/workflow-release.yml'
  ]);
  await putFileContent(
    octokit,
    repoFullName,
    '.github/workflows/workflow-ci.yml',
    readFixture('integration-test/baselines/workflow-ci.yml'),
    defaultBranch,
    'chore: reset workflow ci for integration'
  );
}

async function resetAutolinksRepo(octokit, repoFullName) {
  info(`Resetting autolinks baseline for ${repoFullName}`);
  await ensureRepositoryExists(octokit, repoFullName);
  const obsoleteAutolink = readJsonFixture('integration-test/baselines/obsolete-autolink.json');
  await deleteAutolinkIfExistsByPrefix(octokit, repoFullName, 'ENG-');
  await deleteAutolinkIfExistsByPrefix(octokit, repoFullName, obsoleteAutolink.key_prefix);
  await createAutolink(octokit, repoFullName, obsoleteAutolink);
}

async function resetCopilotRepo(octokit, repoFullName) {
  info(`Resetting copilot instructions baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'copilot-instructions-md-sync', ['.github/copilot-instructions.md']);
}

async function resetPackageJsonRepo(octokit, repoFullName, baselineContent) {
  info(`Resetting package.json baseline for ${repoFullName}`);
  const defaultBranch = await resetPrSyncRepo(octokit, repoFullName, 'package-json-sync');
  await putFileContent(
    octokit,
    repoFullName,
    'package.json',
    baselineContent,
    defaultBranch,
    'chore: reset package.json for integration'
  );
}

async function resetCodeownersRootRepo(octokit, repoFullName) {
  info(`Resetting root CODEOWNERS baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'codeowners-sync', ['CODEOWNERS', '.github/CODEOWNERS']);
}

async function resetCodeownersDocsRepo(octokit, repoFullName) {
  info(`Resetting docs CODEOWNERS baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'codeowners-sync', [
    'docs/CODEOWNERS',
    '.github/CODEOWNERS',
    'CODEOWNERS'
  ]);
}

async function resetCodeownersVarsRepo(octokit, repoFullName) {
  info(`Resetting CODEOWNERS vars baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'codeowners-sync', ['.github/CODEOWNERS', 'CODEOWNERS']);
}

async function resetDependabotPrRepo(octokit, repoFullName, mode) {
  info(`Resetting dependabot PR baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'dependabot-yml-sync', ['.github/dependabot.yml']);

  const filesOnBranch = [
    {
      path: '.github/dependabot.yml',
      content:
        mode === 'up-to-date'
          ? readFixture('integration-test/sources/dependabot.yml')
          : readFixture('integration-test/baselines/dependabot.stale.yml')
    }
  ];

  await seedOpenPr(octokit, repoFullName, {
    branchName: 'dependabot-yml-sync',
    title: 'chore: update dependabot.yml',
    filesOnBranch
  });
}

async function resetWorkflowPrRepo(octokit, repoFullName, mode) {
  info(`Resetting workflow PR baseline for ${repoFullName}`);
  await resetPrSyncRepo(octokit, repoFullName, 'workflow-files-sync', [
    '.github/workflows/workflow-ci.yml',
    '.github/workflows/workflow-release.yml'
  ]);

  const filesOnBranch = [];
  if (mode === 'created') {
    filesOnBranch.push({
      path: '.github/workflows/workflow-ci.yml',
      content: readFixture('integration-test/sources/workflow-ci.yml')
    });
  } else if (mode === 'mixed') {
    filesOnBranch.push({
      path: '.github/workflows/workflow-ci.yml',
      content: readFixture('integration-test/baselines/workflow-ci.yml')
    });
  }

  await seedOpenPr(octokit, repoFullName, {
    branchName: 'workflow-files-sync',
    title: 'chore: sync workflow configuration',
    filesOnBranch
  });
}

async function resetPackageJsonPrRepo(octokit, repoFullName, mode) {
  info(`Resetting package.json PR baseline for ${repoFullName}`);
  const defaultBranch = await resetPrSyncRepo(octokit, repoFullName, 'package-json-sync');
  await putFileContent(
    octokit,
    repoFullName,
    'package.json',
    readFixture('integration-test/baselines/package.full.json'),
    defaultBranch,
    'chore: reset package.json baseline for integration'
  );

  await seedOpenPr(octokit, repoFullName, {
    branchName: 'package-json-sync',
    title: 'chore: update package.json',
    filesOnBranch: [
      {
        path: 'package.json',
        content:
          mode === 'up-to-date'
            ? readFixture('integration-test/sources/package.full.json')
            : readFixture('integration-test/baselines/package.pr.stale.json')
      }
    ]
  });
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();

    for (const repoConfig of repos) {
      const repoFullName = repoConfig.repo;

      if (repoFullName.endsWith('/it-settings-a')) {
        await resetSettingsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-merge-commit-a')) {
        await resetMergeCommitRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-rebase-merge-a')) {
        await resetRebaseMergeRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-update-branch-a')) {
        await resetUpdateBranchRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-immutable-releases-a')) {
        await resetImmutableReleasesRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-code-scanning-a')) {
        await resetCodeScanningRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-secret-scanning-a')) {
        await resetSecretScanningRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-push-protection-a')) {
        await resetSecretScanningRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-dependabot-alerts-a')) {
        await resetDependabotAlertsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-dependabot-security-updates-a')) {
        await resetDependabotSecurityUpdatesRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-dependabot-yml-a')) {
        await resetDependabotYmlRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-gitignore-a')) {
        await resetGitignoreRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-rulesets-a')) {
        await resetRulesetsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-pull-request-template-a')) {
        await resetPullRequestTemplateRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-workflow-single-a')) {
        await resetWorkflowSingleRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-workflows-a')) {
        await resetWorkflowFilesRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-autolinks-a')) {
        await resetAutolinksRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-copilot-a')) {
        await resetCopilotRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-package-json-a')) {
        await resetPackageJsonRepo(octokit, repoFullName, readFixture('integration-test/baselines/package.full.json'));
      } else if (repoFullName.endsWith('/it-package-json-scripts-a')) {
        await resetPackageJsonRepo(
          octokit,
          repoFullName,
          readFixture('integration-test/baselines/package.scripts.json')
        );
      } else if (repoFullName.endsWith('/it-package-json-engines-a')) {
        await resetPackageJsonRepo(
          octokit,
          repoFullName,
          readFixture('integration-test/baselines/package.engines.json')
        );
      } else if (repoFullName.endsWith('/it-codeowners-root-a')) {
        await resetCodeownersRootRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-codeowners-docs-a')) {
        await resetCodeownersDocsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-codeowners-vars-a')) {
        await resetCodeownersVarsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-pr-up-to-date-a')) {
        await resetDependabotPrRepo(octokit, repoFullName, 'up-to-date');
      } else if (repoFullName.endsWith('/it-pr-updated-a')) {
        await resetDependabotPrRepo(octokit, repoFullName, 'updated');
      } else if (repoFullName.endsWith('/it-pr-dry-run-update-a')) {
        await resetDependabotPrRepo(octokit, repoFullName, 'updated');
      } else if (repoFullName.endsWith('/it-pr-workflows-created-a')) {
        await resetWorkflowPrRepo(octokit, repoFullName, 'created');
      } else if (repoFullName.endsWith('/it-pr-workflows-mixed-a')) {
        await resetWorkflowPrRepo(octokit, repoFullName, 'mixed');
      } else if (repoFullName.endsWith('/it-pr-package-json-up-to-date-a')) {
        await resetPackageJsonPrRepo(octokit, repoFullName, 'up-to-date');
      } else if (repoFullName.endsWith('/it-pr-package-json-updated-a')) {
        await resetPackageJsonPrRepo(octokit, repoFullName, 'updated');
      } else if (repoFullName.endsWith('/it-pr-package-json-dry-run-update-a')) {
        await resetPackageJsonPrRepo(octokit, repoFullName, 'updated');
      } else if (repoFullName.endsWith('/it-topics-a')) {
        await resetTopicsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-codeowners-a')) {
        await resetCodeownersRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-warning-a')) {
        await resetCodeownersRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-unchanged-a')) {
        await resetUnchangedRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-dry-run-a')) {
        await resetDryRunRepo(octokit, repoFullName);
      } else if (repoFullName.includes('/it-select-')) {
        await resetSelectionRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-archived-a')) {
        await resetArchivedRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-invalid-codeowners-path-a')) {
        await resetInvalidCodeownersPathRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-invalid-workflows-file-a')) {
        await resetInvalidWorkflowFilesRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-missing-package-json-a')) {
        await resetMissingPackageJsonRepo(octokit, repoFullName);
      } else if (
        repoFullName.endsWith('/it-invalid-autolinks-file-a') ||
        repoFullName.endsWith('/it-invalid-rulesets-file-a') ||
        repoFullName.endsWith('/it-invalid-package-json-file-a')
      ) {
        await ensureRepositoryExists(octokit, repoFullName);
      } else {
        throw new Error(`No reset scenario configured for ${repoFullName}`);
      }
    }

    await resetSelectionCustomProperties(octokit, repos);

    info('Integration test repositories reset successfully.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
