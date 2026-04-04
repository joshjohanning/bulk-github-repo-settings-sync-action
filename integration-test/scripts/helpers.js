import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

function writeLine(stream, message) {
  stream.write(`${message}\n`);
}

export function info(message) {
  writeLine(process.stdout, message);
}

export function errorLine(message) {
  writeLine(process.stderr, message);
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getApiUrl() {
  return process.env.INTEGRATION_API_URL?.trim() || 'https://api.github.com';
}

export function getIntegrationRepositoriesFile() {
  return process.env.INTEGRATION_REPOSITORIES_FILE?.trim() || 'integration-test/configs/repos.yml';
}

export function createOctokit() {
  return new Octokit({
    auth: getRequiredEnv('INTEGRATION_GH_TOKEN'),
    baseUrl: getApiUrl()
  });
}

export function readIntegrationConfig() {
  const configPath = path.resolve(getIntegrationRepositoriesFile());
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configContent);

  assert(config && Array.isArray(config.repos), `Invalid integration config at ${configPath}`);

  return {
    path: configPath,
    repos: config.repos
  };
}

export function getRepoParts(repoFullName) {
  const [owner, repo] = repoFullName.split('/');
  assert(owner && repo, `Invalid repository name: ${repoFullName}`);
  return { owner, repo };
}

export async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function paceMutation() {
  await sleep(1000);
}

export async function getRepository(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}

export async function getDefaultBranch(octokit, repoFullName) {
  const repository = await getRepository(octokit, repoFullName);
  return repository.default_branch;
}

export async function ensureRepositoryExists(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    return await getRepository(octokit, repoFullName);
  } catch (caughtError) {
    if (caughtError.status !== 404) {
      throw caughtError;
    }
  }

  await octokit.rest.repos.createInOrg({
    org: owner,
    name: repo,
    private: false,
    auto_init: true,
    description: 'Live integration test repository for bulk-github-repo-settings-sync-action'
  });
  await paceMutation();

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      return await getRepository(octokit, repoFullName);
    } catch (caughtError) {
      if (caughtError.status !== 404) {
        throw caughtError;
      }
      await sleep(1000);
    }
  }

  throw new Error(`Repository ${repoFullName} was created but did not become visible via the API in time`);
}

export async function updateRepositorySettings(octokit, repoFullName, settings) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.update({
    owner,
    repo,
    ...settings
  });
  await paceMutation();
}

export async function setRepositoryArchived(octokit, repoFullName, archived) {
  await updateRepositorySettings(octokit, repoFullName, { archived });
}

export async function replaceTopics(octokit, repoFullName, names) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.replaceAllTopics({
    owner,
    repo,
    names
  });
  await paceMutation();
}

export async function getTopics(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.getAllTopics({ owner, repo });
  return data.names || [];
}

export async function ensureOrgCustomProperty(octokit, org, propertyName, options) {
  await octokit.request('PUT /orgs/{org}/properties/schema/{custom_property_name}', {
    org,
    custom_property_name: propertyName,
    ...options
  });
  await paceMutation();
}

export async function setOrgCustomPropertyValues(octokit, org, repositoryNames, properties) {
  await octokit.request('PATCH /orgs/{org}/properties/values', {
    org,
    repository_names: repositoryNames,
    properties
  });
  await paceMutation();
}

export async function getCodeScanningDefaultSetupState(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    const { data } = await octokit.rest.codeScanning.getDefaultSetup({
      owner,
      repo
    });
    return data.state;
  } catch (caughtError) {
    if (caughtError.status === 404) {
      return 'not-configured';
    }
    throw caughtError;
  }
}

export async function setCodeScanningDefaultSetupState(octokit, repoFullName, state) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.codeScanning.updateDefaultSetup({
    owner,
    repo,
    state
  });
  await paceMutation();
}

export async function getImmutableReleasesEnabled(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/immutable-releases', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    return response.data.enabled === true;
  } catch (caughtError) {
    if (caughtError.status === 404) {
      return false;
    }
    throw caughtError;
  }
}

export async function setImmutableReleasesEnabled(octokit, repoFullName, enabled) {
  const { owner, repo } = getRepoParts(repoFullName);
  const method = enabled ? 'PUT' : 'DELETE';

  try {
    await octokit.request(`${method} /repos/{owner}/{repo}/immutable-releases`, {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
  } catch (caughtError) {
    if (!enabled && caughtError.status === 404) {
      return;
    }
    throw caughtError;
  }

  await paceMutation();
}

export async function setSecurityAndAnalysis(octokit, repoFullName, securityAndAnalysis) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.update({
    owner,
    repo,
    security_and_analysis: securityAndAnalysis
  });
  await paceMutation();
}

export async function getDependabotAlertsEnabled(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    await octokit.request('GET /repos/{owner}/{repo}/vulnerability-alerts', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    return true;
  } catch (caughtError) {
    if (caughtError.status === 404) {
      return false;
    }
    throw caughtError;
  }
}

export async function setDependabotAlertsEnabled(octokit, repoFullName, enabled) {
  const { owner, repo } = getRepoParts(repoFullName);
  const method = enabled ? 'PUT' : 'DELETE';

  try {
    await octokit.request(`${method} /repos/{owner}/{repo}/vulnerability-alerts`, {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
  } catch (caughtError) {
    if (!enabled && caughtError.status === 404) {
      return;
    }
    throw caughtError;
  }

  await paceMutation();
}

export async function getDependabotSecurityUpdatesEnabled(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/automated-security-fixes', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    return response.data.enabled === true;
  } catch (caughtError) {
    if (caughtError.status === 404) {
      return false;
    }
    throw caughtError;
  }
}

export async function setDependabotSecurityUpdatesEnabled(octokit, repoFullName, enabled) {
  const { owner, repo } = getRepoParts(repoFullName);
  const method = enabled ? 'PUT' : 'DELETE';

  try {
    await octokit.request(`${method} /repos/{owner}/{repo}/automated-security-fixes`, {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
  } catch (caughtError) {
    if (!enabled && (caughtError.status === 404 || caughtError.status === 422)) {
      return;
    }
    throw caughtError;
  }

  await paceMutation();
}

export async function listOpenPullRequestsForBranch(octokit, repoFullName, branchName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${branchName}`
  });
  return data;
}

export async function closePullRequest(octokit, repoFullName, pullNumber) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    state: 'closed'
  });
  await paceMutation();
}

export async function deleteBranchIfExists(octokit, repoFullName, branchName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`
    });
    await paceMutation();
  } catch (caughtError) {
    if (caughtError.status !== 422 && caughtError.status !== 409 && caughtError.status !== 404) {
      throw caughtError;
    }
  }
}

export async function ensureBranchFromDefault(octokit, repoFullName, branchName, forceReset = true) {
  const { owner, repo } = getRepoParts(repoFullName);
  const defaultBranch = await getDefaultBranch(octokit, repoFullName);
  const { data: defaultRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`
  });

  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`
    });

    if (forceReset) {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
        sha: defaultRef.object.sha,
        force: true
      });
      await paceMutation();
    }
  } catch (caughtError) {
    if (caughtError.status !== 404) {
      throw caughtError;
    }

    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: defaultRef.object.sha
    });
    await paceMutation();
  }

  return defaultBranch;
}

export async function deleteFileIfExists(octokit, repoFullName, filePath, branch) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch
    });

    await octokit.rest.repos.deleteFile({
      owner,
      repo,
      path: filePath,
      message: `chore: remove ${filePath} for integration reset`,
      sha: data.sha,
      branch
    });
    await paceMutation();
  } catch (caughtError) {
    if (caughtError.status !== 404) {
      throw caughtError;
    }
  }
}

export async function putFileContent(octokit, repoFullName, filePath, content, branch, message) {
  const { owner, repo } = getRepoParts(repoFullName);
  let sha;

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch
    });
    sha = data.sha;
  } catch (caughtError) {
    if (caughtError.status !== 404) {
      throw caughtError;
    }
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
    sha
  });
  await paceMutation();
}

export async function createPullRequest(octokit, repoFullName, { title, head, base, body }) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
    body
  });
  await paceMutation();
  return data;
}

export async function getFileContent(octokit, repoFullName, filePath, ref) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref
  });

  return Buffer.from(data.content, 'base64').toString('utf8');
}

export async function listRulesets(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.getRepoRulesets({
    owner,
    repo
  });
  return data;
}

export async function createRuleset(octokit, repoFullName, rulesetConfig) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.createRepoRuleset({
    owner,
    repo,
    ...rulesetConfig
  });
  await paceMutation();
  return data;
}

export async function deleteRulesetIfExistsByName(octokit, repoFullName, rulesetName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const rulesets = await listRulesets(octokit, repoFullName);
  const match = rulesets.find(ruleset => ruleset.name === rulesetName);

  if (!match) {
    return;
  }

  await octokit.rest.repos.deleteRepoRuleset({
    owner,
    repo,
    ruleset_id: match.id
  });
  await paceMutation();
}

export async function getRulesetByName(octokit, repoFullName, rulesetName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const rulesets = await listRulesets(octokit, repoFullName);
  const match = rulesets.find(ruleset => ruleset.name === rulesetName);

  if (!match) {
    return null;
  }

  const { data } = await octokit.rest.repos.getRepoRuleset({
    owner,
    repo,
    ruleset_id: match.id
  });
  return data;
}

export async function listAutolinks(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.listAutolinks({
    owner,
    repo
  });
  return data;
}

export async function createAutolink(octokit, repoFullName, autolinkConfig) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.createAutolink({
    owner,
    repo,
    ...autolinkConfig
  });
  await paceMutation();
}

export async function deleteAutolinkIfExistsByPrefix(octokit, repoFullName, keyPrefix) {
  const { owner, repo } = getRepoParts(repoFullName);
  const autolinks = await listAutolinks(octokit, repoFullName);
  const match = autolinks.find(autolink => autolink.key_prefix === keyPrefix);

  if (!match) {
    return;
  }

  await octokit.rest.repos.deleteAutolink({
    owner,
    repo,
    autolink_id: match.id
  });
  await paceMutation();
}
