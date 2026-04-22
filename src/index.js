/**
 * Bulk GitHub Repository Settings Action
 * Update repository settings in bulk for multiple GitHub repositories
 *
 * Local Development & Testing:
 *
 * Uses core.getInput() which reads INPUT_<NAME> env vars (hyphens preserved).
 * Since shell variables can't contain hyphens, set these via env(1):
 *
 *    env 'INPUT_GITHUB-TOKEN=ghp_xxx' 'INPUT_REPOSITORIES=owner/repo1,owner/repo2' node src/index.js
 */

import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as yaml from 'js-yaml';

/**
 * Get the known configuration keys from action.yml.
 * This dynamically reads the action.yml file to determine valid input keys,
 * avoiding the need to maintain a hardcoded list.
 * @returns {Set<string>} Set of valid configuration keys
 */
function getKnownRepoConfigKeys() {
  // 'repo' is always valid as it's the repository identifier in YAML config
  // 'codeowners-vars' is YAML-only config for template variables (no action input)
  const keys = new Set(['repo', 'codeowners-vars']);

  try {
    // Get the directory where this script is located
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // action.yml is in the root directory (parent of src/)
    const actionYmlPath = path.join(__dirname, '..', 'action.yml');
    const actionYmlContent = fs.readFileSync(actionYmlPath, 'utf8');
    const actionConfig = yaml.load(actionYmlContent);

    if (actionConfig?.inputs) {
      for (const inputName of Object.keys(actionConfig.inputs)) {
        keys.add(inputName);
      }
    }
  } catch (error) {
    // If we can't read action.yml, log a warning but don't fail
    // This allows the action to still work even if there's an issue
    core.warning(`Could not read action.yml to determine valid configuration keys: ${error.message}`);
  }

  return keys;
}

// Cache the known keys to avoid re-reading action.yml multiple times
let _knownRepoConfigKeys = null;

/**
 * Get cached known configuration keys
 * @returns {Set<string>} Set of valid configuration keys
 */
function getCachedKnownRepoConfigKeys() {
  if (_knownRepoConfigKeys === null) {
    _knownRepoConfigKeys = getKnownRepoConfigKeys();
  }
  return _knownRepoConfigKeys;
}

/**
 * Reset the known repo config keys cache.
 * Exported for testing purposes to ensure test isolation.
 */
export function resetKnownRepoConfigKeysCache() {
  _knownRepoConfigKeys = null;
}

/**
 * Validate repository configuration and warn about unknown keys
 * @param {Object} repoConfig - Repository configuration object from YAML
 * @param {string} repoName - Repository name for logging context
 */
function validateRepoConfig(repoConfig, repoName) {
  if (typeof repoConfig !== 'object' || repoConfig === null) {
    return;
  }

  const knownKeys = getCachedKnownRepoConfigKeys();

  for (const key of Object.keys(repoConfig)) {
    if (!knownKeys.has(key)) {
      core.warning(
        `⚠️  Unknown configuration key "${key}" found for repository "${repoName}". ` +
          `This setting may not exist, may not be available in this version, or may have a typo.`
      );
    }
  }
}

/**
 * Escape special regex characters in a string.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace template variables in content with provided values.
 * Template variables use the format {{variable_name}}.
 * @param {string} content - Content with template variables
 * @param {Object} vars - Object with variable names and values
 * @returns {string} Content with variables replaced
 */
export function replaceTemplateVariables(content, vars) {
  if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) {
    return content;
  }

  let result = content;
  for (const [varName, varValue] of Object.entries(vars)) {
    // Replace all occurrences of {{varName}} with varValue
    // Use a regex to match the exact variable name with optional whitespace
    // Escape varName to handle any special regex characters safely
    const escapedVarName = escapeRegExp(varName);
    const regex = new RegExp(`\\{\\{\\s*${escapedVarName}\\s*\\}\\}`, 'g');
    // Use a function for replacement to avoid special replacement patterns ($&, $1, etc.)
    result = result.replace(regex, () => String(varValue));
  }

  return result;
}

/**
 * File-path config keys that should be resolved against base-path.
 * @type {string[]}
 */
const FILE_PATH_CONFIG_KEYS = [
  'rulesets-file',
  'dependabot-yml',
  'gitignore',
  'workflow-files',
  'copilot-instructions-md',
  'codeowners',
  'package-json-file',
  'pull-request-template',
  'autolinks-file',
  'environments-file'
];

/**
 * Resolve a single file path against a base path.
 * Absolute paths are returned unchanged; relative paths are joined with basePath.
 * Non-string or falsy values are returned as-is.
 * @param {string} basePath - Base path to prepend
 * @param {*} filePath - File path to resolve (non-string values returned unchanged)
 * @returns {*} Resolved file path, or original value if not a non-empty string
 */
export function resolveFilePath(basePath, filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(basePath, filePath);
}

/**
 * Apply base-path resolution to all file-path config values in a repo config object.
 * Handles string values, comma-separated strings (for rulesets-file/workflow-files),
 * and array values.
 * @param {Object} repoConfig - Repository configuration object
 * @param {string} basePath - Base path to prepend to relative file paths
 * @returns {Object} New repo config with resolved file paths
 */
export function applyBasePathToRepoConfig(repoConfig, basePath) {
  if (!basePath) return repoConfig;

  const resolved = { ...repoConfig };
  for (const key of FILE_PATH_CONFIG_KEYS) {
    if (resolved[key] === undefined) continue;

    const value = resolved[key];
    if (typeof value === 'string') {
      // rulesets-file and workflow-files support comma-separated paths
      if (key === 'rulesets-file' || key === 'workflow-files') {
        resolved[key] = value
          .split(',')
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .map(p => resolveFilePath(basePath, p))
          .join(',');
      } else {
        resolved[key] = resolveFilePath(basePath, value);
      }
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(p => (typeof p === 'string' ? resolveFilePath(basePath, p) : p));
    }
  }

  return resolved;
}

/**
 * Get optional boolean input - returns null if not set.
 * Unlike core.getBooleanInput (which throws on empty input), this returns null
 * for unset inputs so callers can distinguish "not configured" from "false".
 * @param {string} name - Input name
 * @returns {boolean|null} Boolean value or null if not set
 */
function getBooleanInput(name) {
  const val = core.getInput(name);
  if (val === '') return null;
  return core.getBooleanInput(name);
}

/**
 * Get optional enum input - returns null if not set.
 * Validates the value against allowed values (case-insensitive).
 * @param {string} name - Input name
 * @param {string[]} allowedValues - Array of allowed enum values (uppercase)
 * @returns {string|null} Uppercase enum value or null if not set
 */
function getEnumInput(name, allowedValues) {
  const val = core.getInput(name);
  if (val === '') return null;
  const upper = val.trim().toUpperCase();
  if (!allowedValues.includes(upper)) {
    throw new Error(`Invalid value for '${name}': '${val}'. Allowed values: ${allowedValues.join(', ')}`);
  }
  return upper;
}

/**
 * Coerce a repo-specific YAML config value to boolean.
 * Falls back to the global default when the value is missing or not a proper boolean.
 * @param {*} value - Raw value from YAML config
 * @param {string} fieldName - Field name for warning messages
 * @param {string} repo - Repository name for warning messages
 * @param {boolean|null} globalDefault - Global input value to fall back to
 * @returns {boolean|null} Coerced boolean or global default
 */
function coerceBooleanConfig(value, fieldName, repo, globalDefault) {
  if (value === undefined) return globalDefault;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  core.warning(
    `Invalid boolean value for '${fieldName}' in repo '${repo}': ${JSON.stringify(value)}. Using global default.`
  );
  return globalDefault;
}

/**
 * Coerce a repo-specific YAML config value to an enum string.
 * Falls back to the global default when the value is missing or not a valid enum.
 * @param {*} value - Raw value from YAML config
 * @param {string} fieldName - Field name for warning messages
 * @param {string} repo - Repository name for warning messages
 * @param {string[]} allowedValues - Array of allowed enum values (uppercase)
 * @param {string|null} globalDefault - Global input value to fall back to
 * @returns {string|null} Uppercase enum value or global default
 */
function coerceEnumConfig(value, fieldName, repo, allowedValues, globalDefault) {
  if (value === undefined) return globalDefault;
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (allowedValues.includes(upper)) return upper;
  }
  core.warning(
    `Invalid value for '${fieldName}' in repo '${repo}': ${JSON.stringify(value)}. Allowed values: ${allowedValues.join(', ')}. Using global default.`
  );
  return globalDefault;
}

/**
 * Get all repositories with their custom property values for an organization
 * Uses the efficient org-level API: GET /orgs/{org}/properties/values
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Organization name
 * @returns {Promise<Array>} Array of repository objects with their properties
 */
async function getOrgRepositoriesWithProperties(octokit, owner) {
  const allRepos = [];
  const perPage = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await octokit.request('GET /orgs/{org}/properties/values', {
      org: owner,
      per_page: perPage,
      page
    });

    allRepos.push(...response.data);

    // Stop when we get fewer results than requested OR an empty page
    // (handles exact multiples of perPage)
    if (response.data.length === 0 || response.data.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allRepos;
}

/**
 * Get repository metadata, using a cache to avoid duplicate API calls.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repoFullName - Repository full name in owner/repo format
 * @param {Map<string, Object>} repositoryMetadataCache - Cache keyed by repo full name
 * @returns {Promise<Object>} GitHub repository metadata
 */
async function getRepositoryMetadata(octokit, repoFullName, repositoryMetadataCache) {
  if (repositoryMetadataCache.has(repoFullName)) {
    return repositoryMetadataCache.get(repoFullName);
  }

  const [repoOwner, repoName] = repoFullName.split('/');

  try {
    const { data } = await octokit.rest.repos.get({
      owner: repoOwner,
      repo: repoName
    });

    repositoryMetadataCache.set(repoFullName, data);
    return data;
  } catch (error) {
    const wrappedError = new Error(`Failed to fetch metadata for repository ${repoFullName}: ${error.message}`);
    if (error.status) {
      wrappedError.status = error.status;
    }
    throw wrappedError;
  }
}

const REPOSITORY_METADATA_FETCH_CONCURRENCY = 5;

/**
 * Map items with a bounded level of concurrency while preserving result order.
 * @template TInput, TOutput
 * @param {Array<TInput>} items - Items to map
 * @param {number} concurrency - Maximum number of concurrent mapper executions
 * @param {(item: TInput, index: number) => Promise<TOutput>} mapper - Async mapper function
 * @returns {Promise<Array<TOutput>>} Mapped results in the original order
 */
async function mapWithConcurrencyLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function ensureRepositoriesHaveMetadata(matchedRepos, octokit, repositoryMetadataCache) {
  return mapWithConcurrencyLimit(matchedRepos, REPOSITORY_METADATA_FETCH_CONCURRENCY, async matchedRepo => ({
    ...matchedRepo,
    repository:
      matchedRepo.repository ?? (await getRepositoryMetadata(octokit, matchedRepo.repo, repositoryMetadataCache))
  }));
}

/**
 * Filter repositories by custom property value
 * Uses the efficient org-level API that returns all repos with properties in one call
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Owner (organization) name
 * @param {string} propertyName - Name of the custom property to filter by
 * @param {Array<string>} propertyValues - Array of property values to match
 * @returns {Promise<Array>} Array of repository objects matching the custom property
 */
export async function filterRepositoriesByCustomProperty(octokit, owner, propertyName, propertyValues) {
  if (!owner) {
    throw new Error('Owner (organization) must be specified when filtering by custom property');
  }

  if (!propertyName) {
    throw new Error('Custom property name must be specified');
  }

  if (!propertyValues || propertyValues.length === 0) {
    throw new Error('At least one custom property value must be specified');
  }

  try {
    core.info(
      `Fetching repositories with custom property "${propertyName}" matching values: ${propertyValues.join(', ')}...`
    );

    // Verify this is an organization (custom properties are org-only)
    try {
      await octokit.rest.orgs.get({ org: owner });
    } catch (orgError) {
      // Treat only 404 as "not an organization"; rethrow other errors so callers
      // can see permission or server issues instead of a misleading message.
      if (orgError && typeof orgError === 'object' && 'status' in orgError && orgError.status === 404) {
        throw new Error('Custom properties are only available for organizations, not for user accounts');
      }
      throw orgError;
    }

    // Use the efficient org-level API that returns ALL repos with their properties
    // This is a single paginated call instead of N+1 calls (one per repo)
    const reposWithProperties = await getOrgRepositoriesWithProperties(octokit, owner);

    core.info(`Found ${reposWithProperties.length} total repositories, filtering by custom property...`);

    // Filter repositories by checking their custom properties
    const matchedRepos = reposWithProperties
      .filter(repo => {
        // Check if the repository has the specified custom property with any of the matching values
        return repo.properties?.some(prop => {
          if (prop.property_name === propertyName) {
            // Convert property value to string for comparison
            const propValue = String(prop.value);
            return propertyValues.includes(propValue);
          }
          return false;
        });
      })
      .map(repo => ({ repo: repo.repository_full_name }));

    core.info(`Found ${matchedRepos.length} repositories matching custom property filter`);
    return matchedRepos;
  } catch (error) {
    throw new Error(`Failed to filter repositories by custom property: ${error.message}`);
  }
}

/**
 * Parse a rules-based configuration file and return repositories with merged settings
 * @param {Object} config - Parsed YAML config object with rules array
 * @param {Octokit} octokit - Octokit instance
 * @returns {Promise<Array>} Array of repository objects with merged settings from matching rules
 */
export async function parseConfigWithRules(config, octokit) {
  if (!config.rules || !Array.isArray(config.rules)) {
    throw new Error('Configuration must contain a "rules" array');
  }

  const owner = config.owner;
  if (!owner) {
    throw new Error('Configuration must specify an "owner" for rules-based configuration');
  }

  // Cache for org repos with properties (to avoid refetching for each rule)
  // Cache for org verification and repo properties fetch
  let cachedReposWithProperties = null;
  const repositoryMetadataCache = new Map();
  let orgVerified = false;

  // Map to track repositories and their merged settings
  // Key: repo full name, Value: merged settings object
  const repoSettingsMap = new Map();

  core.info(`Processing ${config.rules.length} rule(s)...`);

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];

    if (!rule.selector) {
      throw new Error(`Rule ${i + 1} must have a "selector" property`);
    }

    // Default to empty settings object if not provided (rule applies default workflow settings)
    if (rule.settings === undefined) {
      rule.settings = {};
    }

    // Validate settings is a plain object
    if (rule.settings === null || typeof rule.settings !== 'object' || Array.isArray(rule.settings)) {
      throw new Error(
        `Rule ${i + 1}: settings must be an object, got ${rule.settings === null ? 'null' : Array.isArray(rule.settings) ? 'array' : typeof rule.settings}`
      );
    }

    let matchedRepos = [];

    if (rule.selector.fork !== undefined && typeof rule.selector.fork !== 'boolean') {
      throw new Error(`Rule ${i + 1}: selector "fork" must be a boolean, got ${typeof rule.selector.fork}`);
    }

    if (
      rule.selector.visibility !== undefined &&
      !['public', 'private', 'internal'].includes(rule.selector.visibility)
    ) {
      throw new Error(
        `Rule ${i + 1}: selector "visibility" must be one of: public, private, internal (got ${rule.selector.visibility})`
      );
    }

    // Handle custom-property selector
    if (rule.selector['custom-property']) {
      const propConfig = rule.selector['custom-property'];
      const propertyName = propConfig.name;

      // Validate name is a non-empty string
      if (typeof propertyName !== 'string' || propertyName.trim() === '') {
        throw new Error(
          `Rule ${i + 1}: custom-property selector "name" must be a non-empty string (got ${typeof propertyName})`
        );
      }

      // Handle both array and scalar values, normalize to strings
      const rawValues = propConfig.values ?? (propConfig.value !== undefined ? propConfig.value : undefined);
      let propertyValues;

      if (rawValues === undefined || rawValues === null) {
        propertyValues = [];
      } else if (Array.isArray(rawValues)) {
        propertyValues = rawValues;
      } else if (['string', 'number', 'boolean'].includes(typeof rawValues)) {
        // Allow scalar shorthand: values: production
        propertyValues = [rawValues];
      } else {
        throw new Error(
          `Rule ${i + 1}: custom-property "values" must be a scalar or an array of scalars (got ${typeof rawValues})`
        );
      }

      // Normalize all values to strings (YAML can parse numbers/booleans)
      propertyValues = propertyValues.map(v => String(v));

      if (propertyValues.length === 0) {
        throw new Error(`Rule ${i + 1}: custom-property selector must have "value" or "values" property`);
      }

      core.info(`Rule ${i + 1}: Filtering by custom property "${propertyName}" = [${propertyValues.join(', ')}]`);

      // Verify this is an organization (only once)
      if (!orgVerified) {
        try {
          await octokit.rest.orgs.get({ org: owner });
          orgVerified = true;
        } catch (error) {
          // Distinguish "not an org" (404) from permission/transient errors
          if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            throw new Error('Custom properties are only available for organizations, not for user accounts');
          }
          // Surface the original error for non-404 failures (e.g. 403/5xx)
          throw error;
        }
      }

      // Fetch org repos with properties (cached)
      if (!cachedReposWithProperties) {
        core.info(`Fetching all repositories with custom properties for ${owner}...`);
        cachedReposWithProperties = await getOrgRepositoriesWithProperties(octokit, owner);
        core.info(`Found ${cachedReposWithProperties.length} total repositories`);
      }

      // Filter by property
      matchedRepos = cachedReposWithProperties
        .filter(repo => {
          return repo.properties?.some(prop => {
            if (prop.property_name === propertyName) {
              const propValue = String(prop.value);
              return propertyValues.includes(propValue);
            }
            return false;
          });
        })
        .map(repo => ({ repo: repo.repository_full_name }));

      core.info(`  → Matched ${matchedRepos.length} repositories`);
    }
    // Handle repos selector (explicit list)
    else if (rule.selector.repos && Array.isArray(rule.selector.repos)) {
      // Validate that all entries are non-empty strings
      for (let j = 0; j < rule.selector.repos.length; j++) {
        const repo = rule.selector.repos[j];
        if (typeof repo !== 'string' || repo.trim() === '') {
          throw new Error(
            `Rule ${i + 1}: repos selector entry ${j + 1} must be a non-empty string, got: ${typeof repo}`
          );
        }
      }
      matchedRepos = rule.selector.repos.map(repo => {
        const trimmedRepo = repo.trim();
        // If repo doesn't include owner, prepend it
        return { repo: trimmedRepo.includes('/') ? trimmedRepo : `${owner}/${trimmedRepo}` };
      });
      core.info(`Rule ${i + 1}: Targeting ${matchedRepos.length} explicit repositories`);
    }
    // Handle "all" selector
    else if (rule.selector.all === true) {
      core.info(`Rule ${i + 1}: Targeting all repositories for ${owner}`);

      // Fetch all repos for org/user
      let isOrg = false;
      try {
        await octokit.rest.orgs.get({ org: owner });
        isOrg = true;
      } catch (error) {
        // Only treat 404 as "not an org"; rethrow other errors to avoid masking real problems
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          isOrg = false;
        } else {
          throw error;
        }
      }

      const perPage = 100;
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { data } = isOrg
          ? await octokit.rest.repos.listForOrg({ org: owner, type: 'all', per_page: perPage, page })
          : await octokit.rest.repos.listForUser({ username: owner, type: 'all', per_page: perPage, page });
        const ownedRepositories = isOrg ? data : filterRepositoriesByOwner(data, owner);

        matchedRepos.push(...ownedRepositories.map(repository => ({ repo: repository.full_name, repository })));
        for (const repository of ownedRepositories) {
          repositoryMetadataCache.set(repository.full_name, repository);
        }

        if (data.length === 0 || data.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }
      core.info(`  → Matched ${matchedRepos.length} repositories`);
    } else {
      throw new Error(`Rule ${i + 1}: selector must have "custom-property", "repos", or "all" property`);
    }

    if (rule.selector.fork !== undefined || rule.selector.visibility !== undefined) {
      matchedRepos = await ensureRepositoriesHaveMetadata(matchedRepos, octokit, repositoryMetadataCache);
    }

    if (rule.selector.fork !== undefined) {
      matchedRepos = matchedRepos.filter(matchedRepo => matchedRepo.repository.fork === rule.selector.fork);
      core.info(`  → After fork filter (${rule.selector.fork}), ${matchedRepos.length} repositories remain`);
    }

    if (rule.selector.visibility !== undefined) {
      matchedRepos = matchedRepos.filter(matchedRepo => matchedRepo.repository.visibility === rule.selector.visibility);
      core.info(
        `  → After visibility filter (${rule.selector.visibility}), ${matchedRepos.length} repositories remain`
      );
    }

    // Merge settings for each matched repo
    for (const matchedRepo of matchedRepos) {
      const existingSettings = repoSettingsMap.get(matchedRepo.repo) || { repo: matchedRepo.repo };
      // Merge settings (later rules override earlier ones)
      // Destructure to exclude 'repo' from rule.settings to prevent accidental overwrites
      // eslint-disable-next-line no-unused-vars
      const { repo: _ignoredRepo, ...safeSettings } = rule.settings;
      repoSettingsMap.set(matchedRepo.repo, { ...existingSettings, ...safeSettings });
    }
  }

  // Convert map to array and validate each merged config
  const result = Array.from(repoSettingsMap.values());

  // Validate merged settings for each repo (catches typos/unknown keys)
  for (const repoConfig of result) {
    validateRepoConfig(repoConfig, repoConfig.repo);
  }

  core.info(`Total: ${result.length} unique repositories to process`);

  return result;
}

/**
 * Parse repository list from various input sources
 * @param {string} repositories - Comma-separated list or "all"
 * @param {string} repositoriesFile - Path to YAML file
 * @param {string} owner - Owner name (for "all" option or custom property filtering)
 * @param {Octokit} octokit - Octokit instance
 * @param {string} customPropertyName - Name of custom property to filter by (optional)
 * @param {string} customPropertyValue - Comma-separated list of custom property values to match (optional)
 * @returns {Promise<Array>} Array of repository objects with settings
 */
export async function parseRepositories(
  repositories,
  repositoriesFile,
  owner,
  octokit,
  customPropertyName,
  customPropertyValue
) {
  let repoList = [];

  // Validate custom property inputs
  if (customPropertyName && !customPropertyValue) {
    throw new Error('custom-property-value must be specified when custom-property-name is provided');
  }
  if (!customPropertyName && customPropertyValue) {
    throw new Error('custom-property-name must be specified when custom-property-value is provided');
  }

  // Filter by custom property if specified
  if (customPropertyName && customPropertyValue) {
    const propertyValues = customPropertyValue
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);

    if (propertyValues.length === 0) {
      throw new Error('custom-property-value must contain at least one non-empty value after trimming');
    }

    repoList = await filterRepositoriesByCustomProperty(octokit, owner, customPropertyName, propertyValues);
  }
  // Parse from YAML file if provided
  else if (repositoriesFile) {
    try {
      const fileContent = fs.readFileSync(repositoriesFile, 'utf8');
      const data = yaml.load(fileContent);

      // Check if this is a rules-based configuration
      if (Array.isArray(data.rules)) {
        core.info('Detected rules-based configuration file');
        repoList = await parseConfigWithRules(data, octokit);
      }
      // Support repos array format (backwards compatible)
      else if (Array.isArray(data.repos)) {
        repoList = data.repos.map(item => {
          if (typeof item === 'string') {
            // Simple string format: just repo name
            return { repo: item };
          } else if (typeof item === 'object' && item.repo) {
            // Object format with repo and optional settings - validate config keys
            validateRepoConfig(item, item.repo);
            return item;
          } else {
            throw new Error('Each item in repos array must be a string or object with "repo" property');
          }
        });
      } else {
        throw new Error('YAML file must contain a "rules" array or "repos" array');
      }

      // Apply base-path resolution to file path config values
      const rawBasePath = data['base-path'];
      const basePath = typeof rawBasePath === 'string' ? rawBasePath.trim() : rawBasePath;
      if (basePath) {
        if (typeof basePath !== 'string') {
          throw new Error(`'base-path' must be a string, got ${typeof basePath}`);
        }
        core.info(`Resolving file paths relative to base-path: ${basePath}`);
        repoList = repoList.map(repo => applyBasePathToRepoConfig(repo, basePath));
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
        const ownedRepositories = isOrg ? data : filterRepositoriesByOwner(data, owner);

        if (data.length === 0) {
          hasMore = false;
        } else {
          repos.push(...ownedRepositories.map(r => ({ repo: r.full_name })));
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
    throw new Error(
      'No repositories specified. Use repositories, repositories-file, repositories="all" with owner, or custom-property-name with custom-property-value'
    );
  }

  return repoList;
}

/**
 * Valid statuses for a sub-result.
 * Only reportable statuses are included — unchanged/skipped operations
 * do not push sub-results.
 * @readonly
 * @enum {string}
 */
const SubResultStatus = Object.freeze({
  CHANGED: 'changed',
  WARNING: 'warning'
});

/**
 * Human-readable labels for sync operation kinds in the summary table.
 */
const SYNC_KIND_LABELS = Object.freeze({
  'dependabot-sync': 'dependabot.yml',
  'gitignore-sync': '.gitignore',
  'ruleset-sync': 'ruleset',
  'ruleset-create': 'rulesets',
  'ruleset-update': 'rulesets',
  'ruleset-delete': 'rulesets',
  'pr-template-sync': 'PR template',
  'workflow-files-sync': 'workflow files',
  'autolinks-sync': 'autolinks',
  'environments-sync': 'environments',
  'copilot-instructions-sync': 'copilot-instructions.md',
  'codeowners-sync': 'CODEOWNERS',
  'package-json-sync': 'package.json'
});

/**
 * Create a normalized sub-result for a single feature operation.
 * @param {string} kind - Feature identifier (e.g., 'settings', 'topics', 'code-scanning')
 * @param {string} status - One of SubResultStatus values
 * @param {string} message - Human-readable detail for logging
 * @param {{ syncStatus?: string, prNumber?: number, prUrl?: string }} [extra] - Optional sync metadata
 * @returns {{ kind: string, status: string, message: string, syncStatus?: string, prNumber?: number, prUrl?: string }}
 */
function createSubResult(kind, status, message, extra) {
  const sub = { kind, status, message };
  if (extra?.syncStatus) sub.syncStatus = extra.syncStatus;
  if (extra?.prNumber) sub.prNumber = extra.prNumber;
  if (extra?.prUrl) sub.prUrl = extra.prUrl;
  return sub;
}

/**
 * Filter repositories to those owned by the configured owner.
 * GitHub's user repository listing can include repositories visible to the user
 * that are owned by other accounts.
 * @param {Array<Object>} repositories - Repository API responses
 * @param {string} owner - Expected owner login
 * @returns {Array<Object>} Repositories owned by the configured owner
 */
function filterRepositoriesByOwner(repositories, owner) {
  if (typeof owner !== 'string') {
    throw new TypeError(`Invalid repository owner configuration: expected a string but received ${typeof owner}`);
  }
  const normalizedOwner = owner.trim().toLowerCase();
  return repositories.filter(repository => repository.owner?.login?.toLowerCase() === normalizedOwner);
}

/**
 * Format a curated summary message for a sub-result in the summary table.
 * Uses the label map for human-readable names and sync status for phrasing.
 * @param {{ kind: string, status: string, message: string, syncStatus?: string, prNumber?: number }} subResult
 * @param {boolean} dryRun - Whether this is a dry-run
 * @returns {string} Curated summary text
 */
function formatSubResultSummary(subResult, dryRun) {
  const label = SYNC_KIND_LABELS[subResult.kind];
  if (!label) return subResult.message;

  const syncStatus = subResult.syncStatus;
  if (!syncStatus) {
    // Only prefix with label for per-operation ruleset subResults
    if (subResult.kind.startsWith('ruleset-')) {
      return `${label}: ${subResult.message}`;
    }
    return subResult.message;
  }

  const hasPr = subResult.prNumber != null;
  const prRef = hasPr ? formatPrLink(subResult.prNumber, subResult.prUrl) : '';

  if (syncStatus === 'pr-up-to-date') {
    return `${label} ${prRef} up-to-date (pending merge)`;
  } else if (syncStatus === 'would-update-pr') {
    return `Would update existing ${prRef} for ${label}`;
  } else if (syncStatus.startsWith('would-')) {
    return `Would sync ${label}`;
  }

  const wouldPrefix = dryRun ? 'Would sync ' : '';
  return hasPr ? `${wouldPrefix}${label} (${prRef})` : `${wouldPrefix}${label}`;
}

export function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatPrLink(prNumber, prUrl) {
  if (!prUrl) {
    return `PR #${prNumber}`;
  }

  try {
    const parsedUrl = new URL(prUrl);
    if (parsedUrl.protocol !== 'https:') {
      core.warning(`Ignoring PR URL with unsupported protocol in summary: ${prUrl}`);
      return `PR #${prNumber}`;
    }

    const safeUrl = escapeHtmlAttribute(prUrl);
    return `<a href="${safeUrl}">PR #${prNumber}</a>`;
  } catch {
    core.warning(`Ignoring invalid PR URL in summary: ${prUrl}`);
    return `PR #${prNumber}`;
  }
}

/**
 * Update repository settings
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {Object} settings - Settings to update
 * @param {boolean} enableCodeScanning - Enable default CodeQL scanning
 * @param {boolean|null} immutableReleases - Enable or disable immutable releases
 * @param {Array<string>|null} topics - Topics to set on repository
 * @param {Object} securitySettings - Security settings to update
 * @param {boolean|null} securitySettings.secretScanning - Enable or disable secret scanning
 * @param {boolean|null} securitySettings.secretScanningPushProtection - Enable or disable push protection
 * @param {boolean|null} securitySettings.privateVulnerabilityReporting - Enable or disable private vulnerability reporting
 * @param {boolean|null} securitySettings.dependabotAlerts - Enable or disable Dependabot alerts
 * @param {boolean|null} securitySettings.dependabotSecurityUpdates - Enable or disable Dependabot security updates
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
  securitySettings,
  dryRun
) {
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      hasWarnings: false,
      subResults: [],
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
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
          hasWarnings: false,
          subResults: [],
          error: 'Access denied - GitHub App or token does not have permission to access this repository',
          accessDenied: true,
          dryRun
        };
      }
      // Re-throw other errors
      throw error;
    }

    if (currentRepo.archived) {
      return {
        repository: repo,
        success: true,
        hasWarnings: false,
        subResults: [],
        archived: true,
        changes: [],
        dryRun
      };
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
        hasWarnings: false,
        subResults: [],
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
        hasWarnings: false,
        subResults: [],
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
    if (settings.squash_merge_commit_title !== null) {
      updateParams.squash_merge_commit_title = settings.squash_merge_commit_title;
      currentSettings.squash_merge_commit_title = currentRepo.squash_merge_commit_title;
      if (currentRepo.squash_merge_commit_title !== settings.squash_merge_commit_title) {
        changes.push({
          setting: 'squash_merge_commit_title',
          from: currentRepo.squash_merge_commit_title,
          to: settings.squash_merge_commit_title
        });
      }
    }
    if (settings.squash_merge_commit_message !== null) {
      updateParams.squash_merge_commit_message = settings.squash_merge_commit_message;
      // GitHub API requires squash_merge_commit_title when squash_merge_commit_message is set
      if (!updateParams.squash_merge_commit_title) {
        updateParams.squash_merge_commit_title = currentRepo.squash_merge_commit_title;
      }
      currentSettings.squash_merge_commit_message = currentRepo.squash_merge_commit_message;
      if (currentRepo.squash_merge_commit_message !== settings.squash_merge_commit_message) {
        changes.push({
          setting: 'squash_merge_commit_message',
          from: currentRepo.squash_merge_commit_message,
          to: settings.squash_merge_commit_message
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
    if (settings.merge_commit_title !== null) {
      updateParams.merge_commit_title = settings.merge_commit_title;
      currentSettings.merge_commit_title = currentRepo.merge_commit_title;
      if (currentRepo.merge_commit_title !== settings.merge_commit_title) {
        changes.push({
          setting: 'merge_commit_title',
          from: currentRepo.merge_commit_title,
          to: settings.merge_commit_title
        });
      }
    }
    if (settings.merge_commit_message !== null) {
      updateParams.merge_commit_message = settings.merge_commit_message;
      // GitHub API requires merge_commit_title when merge_commit_message is set
      if (!updateParams.merge_commit_title) {
        updateParams.merge_commit_title = currentRepo.merge_commit_title;
      }
      currentSettings.merge_commit_message = currentRepo.merge_commit_message;
      if (currentRepo.merge_commit_message !== settings.merge_commit_message) {
        changes.push({
          setting: 'merge_commit_message',
          from: currentRepo.merge_commit_message,
          to: settings.merge_commit_message
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

    // TODO(v3): Remove legacy properties from the result object (e.g., topicsChange, codeScanningWarning,
    // secretScanningUpdated, hasWarnings, etc.) once consumers have migrated to subResults.
    // Legacy properties are preserved for backward compatibility of the results JSON output.
    // See: https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/pull/120
    const result = {
      repository: repo,
      success: true,
      hasWarnings: false,
      subResults: [],
      settings: updateParams,
      currentSettings,
      changes,
      dryRun
    };

    // Update repository settings (skip in dry-run mode)
    if (!dryRun && changes.length > 0) {
      await octokit.rest.repos.update(updateParams);
    }

    if (changes.length > 0) {
      const wouldPrefix = dryRun ? 'Would update ' : '';
      const settingNames = changes.map(c => c.setting.replace(/_/g, '-'));
      result.subResults.push(
        createSubResult('settings', SubResultStatus.CHANGED, `${wouldPrefix}settings: ${settingNames.join(', ')}`)
      );
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
          const topicChanges = [];
          if (topicsToAdd.length > 0) topicChanges.push(`+${topicsToAdd.join(', ')}`);
          if (topicsToRemove.length > 0) topicChanges.push(`-${topicsToRemove.join(', ')}`);
          const wouldPrefix = dryRun ? 'Would update ' : '';
          result.subResults.push(
            createSubResult('topics', SubResultStatus.CHANGED, `${wouldPrefix}topics: ${topicChanges.join(', ')}`)
          );
        } else {
          result.topicsUnchanged = true;
        }
        result.topics = topics;
      } catch (error) {
        result.topicsWarning = `Could not process topics: ${error.message}`;
        result.hasWarnings = true;
        result.subResults.push(createSubResult('topics', SubResultStatus.WARNING, 'Topics produced a warning'));
      }
    }

    // Handle CodeQL scanning
    if (enableCodeScanning !== null) {
      try {
        // Try to get current code scanning setup
        let currentCodeScanning = null;
        try {
          const { data: codeScanningData } = await octokit.rest.codeScanning.getDefaultSetup({
            owner,
            repo: repoName
          });
          currentCodeScanning = codeScanningData.state;
        } catch (error) {
          if (error.status === 404 || (error.status === 403 && !enableCodeScanning)) {
            currentCodeScanning = 'not-configured';
          } else {
            throw error;
          }
        }

        result.currentCodeScanning = currentCodeScanning;

        const desiredState = enableCodeScanning ? 'configured' : 'not-configured';

        if (currentCodeScanning !== desiredState) {
          result.codeScanningChange = {
            from: currentCodeScanning,
            to: desiredState
          };

          if (!dryRun) {
            await octokit.rest.codeScanning.updateDefaultSetup({
              owner,
              repo: repoName,
              state: desiredState,
              query_suite: 'default'
            });
            if (enableCodeScanning) {
              result.codeScanningEnabled = true;
            } else {
              result.codeScanningDisabled = true;
            }
          } else {
            if (enableCodeScanning) {
              result.codeScanningWouldEnable = true;
            } else {
              result.codeScanningWouldDisable = true;
            }
          }
          const action = enableCodeScanning ? 'enable' : 'disable';
          const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
          result.subResults.push(
            createSubResult('code-scanning', SubResultStatus.CHANGED, `${actionText} CodeQL scanning`)
          );
        } else {
          result.codeScanningUnchanged = true;
        }
      } catch (error) {
        // CodeQL setup might fail for various reasons (not supported language, already enabled, etc.)
        result.codeScanningWarning = `Could not process CodeQL: ${error.message}`;
        result.hasWarnings = true;
        result.subResults.push(
          createSubResult('code-scanning', SubResultStatus.WARNING, 'CodeQL scanning produced a warning')
        );
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
          const action = immutableReleases ? 'enable' : 'disable';
          const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
          result.subResults.push(
            createSubResult('immutable-releases', SubResultStatus.CHANGED, `${actionText} immutable releases`)
          );
        } else {
          result.immutableReleasesUnchanged = true;
        }
      } catch (error) {
        // Immutable releases might fail for various reasons (insufficient permissions, not available, etc.)
        result.immutableReleasesWarning = `Could not process immutable releases: ${error.message}`;
        result.hasWarnings = true;
        result.subResults.push(
          createSubResult('immutable-releases', SubResultStatus.WARNING, 'Immutable releases produced a warning')
        );
      }
    }

    // Handle security settings (only if securitySettings object is provided)
    if (securitySettings) {
      // Handle secret scanning settings
      if (securitySettings.secretScanning !== null) {
        try {
          // Get current secret scanning status from security_and_analysis
          const currentSecretScanning = currentRepo.security_and_analysis?.secret_scanning?.status === 'enabled';
          result.currentSecretScanning = currentSecretScanning;

          if (currentSecretScanning !== securitySettings.secretScanning) {
            result.secretScanningChange = {
              from: currentSecretScanning,
              to: securitySettings.secretScanning
            };

            if (!dryRun) {
              await octokit.rest.repos.update({
                owner,
                repo: repoName,
                security_and_analysis: {
                  secret_scanning: {
                    status: securitySettings.secretScanning ? 'enabled' : 'disabled'
                  }
                }
              });
              result.secretScanningUpdated = true;
            } else {
              result.secretScanningWouldUpdate = true;
            }
            const action = securitySettings.secretScanning ? 'enable' : 'disable';
            const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
            result.subResults.push(
              createSubResult('secret-scanning', SubResultStatus.CHANGED, `${actionText} secret scanning`)
            );
          } else {
            result.secretScanningUnchanged = true;
          }
        } catch (error) {
          result.secretScanningWarning = `Could not process secret scanning: ${error.message}`;
          result.hasWarnings = true;
          result.subResults.push(
            createSubResult('secret-scanning', SubResultStatus.WARNING, 'Secret scanning produced a warning')
          );
          // If secret scanning is not available, push protection can't work either
          if (
            securitySettings.secretScanningPushProtection === true &&
            typeof error.status === 'number' &&
            (error.status === 403 || error.status === 404)
          ) {
            result.secretScanningPushProtectionWarning =
              'Cannot enable push protection without secret scanning enabled';
            result.subResults.push(
              createSubResult(
                'push-protection',
                SubResultStatus.WARNING,
                'Secret scanning push protection produced a warning'
              )
            );
          }
        }
      }

      // Handle secret scanning push protection settings
      // Skip if we already set a cascade warning from secret scanning failure
      if (securitySettings.secretScanningPushProtection !== null && !result.secretScanningPushProtectionWarning) {
        try {
          // Get current push protection status from security_and_analysis
          const currentPushProtection =
            currentRepo.security_and_analysis?.secret_scanning_push_protection?.status === 'enabled';
          result.currentSecretScanningPushProtection = currentPushProtection;

          if (currentPushProtection !== securitySettings.secretScanningPushProtection) {
            result.secretScanningPushProtectionChange = {
              from: currentPushProtection,
              to: securitySettings.secretScanningPushProtection
            };

            if (!dryRun) {
              await octokit.rest.repos.update({
                owner,
                repo: repoName,
                security_and_analysis: {
                  secret_scanning_push_protection: {
                    status: securitySettings.secretScanningPushProtection ? 'enabled' : 'disabled'
                  }
                }
              });
              result.secretScanningPushProtectionUpdated = true;
            } else {
              result.secretScanningPushProtectionWouldUpdate = true;
            }
            const action = securitySettings.secretScanningPushProtection ? 'enable' : 'disable';
            const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
            result.subResults.push(
              createSubResult(
                'push-protection',
                SubResultStatus.CHANGED,
                `${actionText} secret scanning push protection`
              )
            );
          } else {
            result.secretScanningPushProtectionUnchanged = true;
          }
        } catch (error) {
          result.secretScanningPushProtectionWarning = `Could not process secret scanning push protection: ${error.message}`;
          result.hasWarnings = true;
          result.subResults.push(
            createSubResult(
              'push-protection',
              SubResultStatus.WARNING,
              'Secret scanning push protection produced a warning'
            )
          );
        }
      }

      // Handle private vulnerability reporting
      if (securitySettings.privateVulnerabilityReporting !== null) {
        try {
          const response = await octokit.request('GET /repos/{owner}/{repo}/private-vulnerability-reporting', {
            owner,
            repo: repoName,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
          const currentPrivateVulnerabilityReporting = response.data.enabled === true;
          result.currentPrivateVulnerabilityReporting = currentPrivateVulnerabilityReporting;

          if (currentPrivateVulnerabilityReporting !== securitySettings.privateVulnerabilityReporting) {
            result.privateVulnerabilityReportingChange = {
              from: currentPrivateVulnerabilityReporting,
              to: securitySettings.privateVulnerabilityReporting
            };

            if (!dryRun) {
              if (securitySettings.privateVulnerabilityReporting) {
                await octokit.request('PUT /repos/{owner}/{repo}/private-vulnerability-reporting', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              } else {
                await octokit.request('DELETE /repos/{owner}/{repo}/private-vulnerability-reporting', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              }
              result.privateVulnerabilityReportingUpdated = true;
            } else {
              result.privateVulnerabilityReportingWouldUpdate = true;
            }
            const action = securitySettings.privateVulnerabilityReporting ? 'enable' : 'disable';
            const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
            result.subResults.push(
              createSubResult(
                'private-vulnerability-reporting',
                SubResultStatus.CHANGED,
                `${actionText} private vulnerability reporting`
              )
            );
          } else {
            result.privateVulnerabilityReportingUnchanged = true;
          }
        } catch (error) {
          result.privateVulnerabilityReportingWarning = `Could not process private vulnerability reporting: ${error.message}`;
          result.hasWarnings = true;
          result.subResults.push(
            createSubResult(
              'private-vulnerability-reporting',
              SubResultStatus.WARNING,
              'Private vulnerability reporting produced a warning'
            )
          );
        }
      }

      // Handle Dependabot alerts (vulnerability alerts)
      if (securitySettings.dependabotAlerts !== null) {
        try {
          // Check current vulnerability alerts status
          let currentDependabotAlerts = false;
          try {
            await octokit.request('GET /repos/{owner}/{repo}/vulnerability-alerts', {
              owner,
              repo: repoName,
              headers: {
                'X-GitHub-Api-Version': '2022-11-28'
              }
            });
            // 204 means enabled
            currentDependabotAlerts = true;
          } catch (error) {
            // 404 means disabled
            if (error.status === 404) {
              currentDependabotAlerts = false;
            } else {
              throw error;
            }
          }

          result.currentDependabotAlerts = currentDependabotAlerts;

          if (currentDependabotAlerts !== securitySettings.dependabotAlerts) {
            result.dependabotAlertsChange = {
              from: currentDependabotAlerts,
              to: securitySettings.dependabotAlerts
            };

            if (!dryRun) {
              if (securitySettings.dependabotAlerts) {
                // Enable vulnerability alerts (also enables dependency graph)
                await octokit.request('PUT /repos/{owner}/{repo}/vulnerability-alerts', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              } else {
                // Disable vulnerability alerts
                await octokit.request('DELETE /repos/{owner}/{repo}/vulnerability-alerts', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              }
              result.dependabotAlertsUpdated = true;
            } else {
              result.dependabotAlertsWouldUpdate = true;
            }
            const action = securitySettings.dependabotAlerts ? 'enable' : 'disable';
            const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
            result.subResults.push(
              createSubResult('dependabot-alerts', SubResultStatus.CHANGED, `${actionText} Dependabot alerts`)
            );
          } else {
            result.dependabotAlertsUnchanged = true;
          }
        } catch (error) {
          result.dependabotAlertsWarning = `Could not process Dependabot alerts: ${error.message}`;
          result.hasWarnings = true;
          result.subResults.push(
            createSubResult('dependabot-alerts', SubResultStatus.WARNING, 'Dependabot alerts produced a warning')
          );
        }
      }

      // Handle Dependabot security updates
      if (securitySettings.dependabotSecurityUpdates !== null) {
        try {
          // Check current Dependabot security updates status
          let currentDependabotSecurityUpdates = false;
          try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/automated-security-fixes', {
              owner,
              repo: repoName,
              headers: {
                'X-GitHub-Api-Version': '2022-11-28'
              }
            });
            currentDependabotSecurityUpdates = response.data.enabled === true;
          } catch (error) {
            // 404 means disabled
            if (error.status === 404) {
              currentDependabotSecurityUpdates = false;
            } else {
              throw error;
            }
          }

          result.currentDependabotSecurityUpdates = currentDependabotSecurityUpdates;

          if (currentDependabotSecurityUpdates !== securitySettings.dependabotSecurityUpdates) {
            result.dependabotSecurityUpdatesChange = {
              from: currentDependabotSecurityUpdates,
              to: securitySettings.dependabotSecurityUpdates
            };

            if (!dryRun) {
              if (securitySettings.dependabotSecurityUpdates) {
                // Enable Dependabot security updates
                await octokit.request('PUT /repos/{owner}/{repo}/automated-security-fixes', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              } else {
                // Disable Dependabot security updates
                await octokit.request('DELETE /repos/{owner}/{repo}/automated-security-fixes', {
                  owner,
                  repo: repoName,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                });
              }
              result.dependabotSecurityUpdatesUpdated = true;
            } else {
              result.dependabotSecurityUpdatesWouldUpdate = true;
            }
            const action = securitySettings.dependabotSecurityUpdates ? 'enable' : 'disable';
            const actionText = dryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase()}${action.slice(1)}d`;
            result.subResults.push(
              createSubResult(
                'dependabot-security-updates',
                SubResultStatus.CHANGED,
                `${actionText} Dependabot security updates`
              )
            );
          } else {
            result.dependabotSecurityUpdatesUnchanged = true;
          }
        } catch (error) {
          result.dependabotSecurityUpdatesWarning = `Could not process Dependabot security updates: ${error.message}`;
          result.hasWarnings = true;
          result.subResults.push(
            createSubResult(
              'dependabot-security-updates',
              SubResultStatus.WARNING,
              'Dependabot security updates produced a warning'
            )
          );
        }
      }
    } // End of if (securitySettings)

    return result;
  } catch (error) {
    return {
      repository: repo,
      success: false,
      hasWarnings: false,
      subResults: [],
      error: error.message,
      dryRun
    };
  }
}

/**
 * Generic function to sync one or more files to a target repository via pull request.
 * If an open PR already exists for the same branch, the function checks if the PR branch
 * content differs from the new source content. If different, it updates the PR branch with
 * a new commit. If the content is already up to date, returns 'pr-up-to-date' status.
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
 * @returns {Promise<Object>} Result object with `success` boolean and `[resultKey]` status string.
 *   Possible status values:
 *   - 'unchanged': File(s) already match source, no action needed
 *   - 'created': New file(s) created via new PR
 *   - 'updated': Existing file(s) updated via new PR
 *   - 'mixed': Both new and existing files synced via new PR
 *   - 'pr-up-to-date': Existing PR already has the latest content
 *   - 'pr-updated': Existing PR branch updated with new content
 *   - 'pr-updated-created': New file(s) added to existing PR branch
 *   - 'pr-updated-mixed': Both new and updated files committed to existing PR branch
 *   - 'would-create': Dry-run - would create new file(s)
 *   - 'would-update': Dry-run - would update existing file(s)
 *   - 'would-update-pr': Dry-run - would update existing PR branch
 */
export async function syncFilesViaPullRequest(octokit, repo, options, dryRun) {
  const {
    files,
    branchName,
    prTitle,
    prBodyCreate,
    prBodyUpdate,
    resultKey,
    fileDescription,
    contentProcessor,
    contentTransformer
  } = options;

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

      // Apply content transformer if provided (e.g., template variable replacement)
      if (contentTransformer) {
        sourceContent = contentTransformer(sourceContent);
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

    // If there's already an open PR, check if content differs and update if needed
    if (existingPR) {
      const targetDesc = fileInfos.length === 1 ? fileInfos[0].targetPath : fileDescription;

      // Fetch content from the PR branch to compare against source
      const prBranchFilesToUpdate = [];
      for (const fileInfo of fileInfos) {
        let prBranchContent = null;
        let prBranchSha = null;

        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo: repoName,
            path: fileInfo.targetPath,
            ref: branchName
          });
          prBranchContent = Buffer.from(data.content, 'base64').toString('utf8');
          prBranchSha = data.sha;
        } catch (error) {
          if (error.status !== 404) {
            throw error;
          }
          // File doesn't exist in PR branch yet
          core.info(`  📄 ${fileInfo.targetPath} does not exist in PR branch ${branchName}, will create it`);
        }

        // Compare content - use contentProcessor if provided
        let comparablePrContent = prBranchContent;
        let finalContent = fileInfo.content;

        if (contentProcessor && prBranchContent) {
          comparablePrContent = contentProcessor.getComparableExisting(prBranchContent);
          finalContent = contentProcessor.getFinalContent(fileInfo.content, prBranchContent);
        }

        // Use nullish coalescing for safety in case comparablePrContent is null
        const comparablePrContentTrimmed = (comparablePrContent ?? '').trim();
        const sourceContentTrimmed = (fileInfo.content ?? '').trim();
        const prNeedsUpdate = !prBranchContent || comparablePrContentTrimmed !== sourceContentTrimmed;

        if (prNeedsUpdate) {
          prBranchFilesToUpdate.push({
            ...fileInfo,
            existingSha: prBranchSha,
            existingContent: prBranchContent,
            finalContent,
            isNew: !prBranchContent
          });
        }
      }

      // If no files need updates in the PR branch, it's already up to date
      if (prBranchFilesToUpdate.length === 0) {
        core.info(`  ✓ PR #${existingPR.number} already has the latest ${targetDesc}`);
        return {
          repository: repo,
          success: true,
          [resultKey]: 'pr-up-to-date',
          message: `PR #${existingPR.number} already has the latest ${targetDesc}`,
          prNumber: existingPR.number,
          prUrl: existingPR.html_url,
          filesProcessed: fileInfos.map(f => f.targetPath),
          dryRun
        };
      }

      // PR exists but content differs - update the PR branch
      core.info(`  🔄 PR #${existingPR.number} exists but content differs, will update`);

      if (dryRun) {
        const newFiles = prBranchFilesToUpdate.filter(f => f.isNew).map(f => f.targetPath);
        const updatedFiles = prBranchFilesToUpdate.filter(f => !f.isNew).map(f => f.targetPath);
        let message;
        if (fileInfos.length === 1) {
          message = prBranchFilesToUpdate[0].isNew
            ? `Would create ${prBranchFilesToUpdate[0].targetPath} in existing PR #${existingPR.number}`
            : `Would update ${prBranchFilesToUpdate[0].targetPath} in existing PR #${existingPR.number}`;
        } else {
          message = `Would update ${prBranchFilesToUpdate.length} file(s) in existing PR #${existingPR.number}`;
        }
        return {
          repository: repo,
          success: true,
          [resultKey]: 'would-update-pr',
          message,
          prNumber: existingPR.number,
          prUrl: existingPR.html_url,
          filesWouldCreate: newFiles.length > 0 ? newFiles : undefined,
          filesWouldUpdate: updatedFiles.length > 0 ? updatedFiles : undefined,
          filesProcessed: fileInfos.map(f => f.targetPath),
          dryRun
        };
      }

      // Commit updated files to the PR branch
      const createdFiles = [];
      const updatedFiles = [];

      for (const file of prBranchFilesToUpdate) {
        const commitMessage = file.isNew ? `chore: add ${file.targetPath}` : `chore: update ${file.targetPath}`;
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

        core.info(`  ✍️  Committed changes to ${file.targetPath} in PR #${existingPR.number}`);
      }

      // Determine status
      let status;
      if (createdFiles.length > 0 && updatedFiles.length > 0) {
        status = 'pr-updated-mixed';
      } else if (createdFiles.length > 0) {
        status = 'pr-updated-created';
      } else {
        status = 'pr-updated';
      }

      // Build message
      let message;
      if (fileInfos.length === 1) {
        message = prBranchFilesToUpdate[0].isNew
          ? `Created ${prBranchFilesToUpdate[0].targetPath} in existing PR #${existingPR.number}`
          : `Updated ${prBranchFilesToUpdate[0].targetPath} in existing PR #${existingPR.number}`;
      } else {
        message = `Updated ${prBranchFilesToUpdate.length} file(s) in existing PR #${existingPR.number}`;
      }

      return {
        repository: repo,
        success: true,
        [resultKey]: status,
        prNumber: existingPR.number,
        prUrl: existingPR.html_url,
        message,
        filesCreated: createdFiles.length > 0 ? createdFiles : undefined,
        filesUpdated: updatedFiles.length > 0 ? updatedFiles : undefined,
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

    // If there's already an open PR, check if content differs and update if needed
    if (existingPR) {
      // Fetch package.json from PR branch to compare
      let prBranchPackageJson = null;
      let prBranchSha = null;

      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo: repoName,
          path: targetPath,
          ref: branchName
        });
        prBranchSha = data.sha;
        const prBranchContent = Buffer.from(data.content, 'base64').toString('utf8');
        prBranchPackageJson = JSON.parse(prBranchContent);
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }
        // File doesn't exist in PR branch yet (shouldn't happen for package.json, but handle gracefully)
        core.info(`  📄 ${targetPath} does not exist in PR branch ${branchName}`);
      }

      // Check if the PR branch already has the desired content
      let prNeedsUpdate = true;
      if (prBranchPackageJson) {
        const prBranchScripts = prBranchPackageJson.scripts || {};
        const prBranchEngines = prBranchPackageJson.engines || {};
        const sourceScripts = sourcePackageJson.scripts || {};
        const sourceEngines = sourcePackageJson.engines || {};

        const scriptsMatch = !syncScripts || deepEqual(sourceScripts, prBranchScripts);
        const enginesMatch = !syncEngines || deepEqual(sourceEngines, prBranchEngines);

        prNeedsUpdate = !scriptsMatch || !enginesMatch;
      }

      if (!prNeedsUpdate) {
        core.info(`  ✓ PR #${existingPR.number} already has the latest ${targetPath}`);
        return {
          repository: repo,
          success: true,
          packageJson: 'pr-up-to-date',
          message: `PR #${existingPR.number} already has the latest ${targetPath}`,
          prNumber: existingPR.number,
          prUrl: existingPR.html_url,
          dryRun
        };
      }

      // PR exists but content differs - update the PR branch
      core.info(`  🔄 PR #${existingPR.number} exists but content differs, will update`);

      if (dryRun) {
        return {
          repository: repo,
          success: true,
          packageJson: 'would-update-pr',
          message: `Would update ${targetPath} in existing PR #${existingPR.number}`,
          prNumber: existingPR.number,
          prUrl: existingPR.html_url,
          changes,
          dryRun
        };
      }

      // Build the updated package.json using PR branch content as base (to preserve other fields)
      const prUpdatedPackageJson = prBranchPackageJson ? { ...prBranchPackageJson } : { ...existingPackageJson };
      if (syncScripts) {
        prUpdatedPackageJson.scripts = sourcePackageJson.scripts || {};
      }
      if (syncEngines) {
        prUpdatedPackageJson.engines = sourcePackageJson.engines || {};
      }

      // Commit updated package.json to PR branch
      const newContent = `${JSON.stringify(prUpdatedPackageJson, null, 2)}\n`;
      const fileParams = {
        owner,
        repo: repoName,
        path: targetPath,
        message: `chore: update ${targetPath}`,
        content: Buffer.from(newContent).toString('base64'),
        branch: branchName
      };
      // Only include SHA if file exists in PR branch (for update), omit for creation
      if (prBranchSha) {
        fileParams.sha = prBranchSha;
      }
      await octokit.rest.repos.createOrUpdateFileContents(fileParams);
      core.info(`  ✍️  Committed changes to ${targetPath} in PR #${existingPR.number}`);

      return {
        repository: repo,
        success: true,
        packageJson: 'pr-updated',
        prNumber: existingPR.number,
        prUrl: existingPR.html_url,
        message: `Updated ${targetPath} in existing PR #${existingPR.number}`,
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
      if (change.field === 'scripts') {
        prBody += `- Updated \`${change.field}\` (${change.from} → ${change.to} entries)\n`;
      } else {
        prBody += `- Updated \`${change.field}\` (${change.from} → ${change.to})\n`;
      }
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
 * Parse a rulesets-file value into an array of file paths.
 * Accepts a single string (comma-separated), a YAML array of strings,
 * or an empty/falsy value (returns empty array).
 * @param {string|string[]} value - The rulesets-file value from config
 * @param {string} [context] - Context for error messages (e.g., repo name)
 * @returns {string[]} Array of trimmed, non-empty file paths
 */
export function parseRulesetsFileValue(value, context) {
  if (!value || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  const label = context ? ` for repo "${context}"` : '';
  let paths;
  if (Array.isArray(value)) {
    paths = value.map(v => {
      if (typeof v !== 'string' || v.trim() === '') {
        throw new Error(`Invalid entry in "rulesets-file" array${label}: expected non-empty strings`);
      }
      return v.trim();
    });
  } else if (typeof value === 'string') {
    paths = value
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  } else {
    throw new Error(`Invalid "rulesets-file"${label}: expected a string, comma-separated string, or array of strings`);
  }

  if (paths.length === 0) {
    throw new Error(`Invalid "rulesets-file"${label}: no file paths provided`);
  }

  return paths;
}

/**
 * Read-only fields returned by the GitHub API that must not be sent in
 * PUT / POST requests.  Uses a blocklist so that any *new* writable fields
 * GitHub adds are passed through without requiring an action update.
 */
export const RULESET_READONLY_FIELDS = new Set([
  'id',
  'node_id',
  'source',
  'source_type',
  'created_at',
  'updated_at',
  '_links',
  'current_user_can_bypass'
]);

/**
 * Return a shallow copy of `config` with all read-only API fields removed.
 * @param {Object} config - Ruleset configuration object
 * @returns {Object} Cleaned configuration object
 */
export function stripRulesetReadonlyFields(config) {
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    if (!RULESET_READONLY_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sync repository rulesets to target repository.
 * Accepts an array of ruleset JSON file paths, processes each one,
 * and handles delete-unmanaged logic across all managed names.
 * Continues processing on individual ruleset failures (warns instead of aborting).
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string[]} rulesetFilePaths - Paths to local ruleset JSON files
 * @param {boolean} deleteUnmanaged - Delete all other rulesets besides those being synced
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object with subResults array
 */
export async function syncRepositoryRulesets(octokit, repo, rulesetFilePaths, deleteUnmanaged, dryRun) {
  const [owner, repoName] = repo.split('/');
  const subResults = [];
  const wouldPrefix = dryRun ? 'Would ' : '';

  if (!owner || !repoName) {
    return {
      repository: repo,
      success: false,
      error: 'Invalid repository format. Expected "owner/repo"',
      dryRun
    };
  }

  if (!rulesetFilePaths || rulesetFilePaths.length === 0) {
    return {
      repository: repo,
      success: true,
      ruleset: 'unchanged',
      message: 'No ruleset files specified',
      subResults: [],
      dryRun
    };
  }

  // Read and parse all ruleset JSON files upfront
  const rulesetConfigs = [];
  for (const filePath of rulesetFilePaths) {
    let rulesetConfig;
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      rulesetConfig = JSON.parse(fileContent);
    } catch (error) {
      return {
        repository: repo,
        success: false,
        error: `Failed to read or parse ruleset file at ${filePath}: ${error.message}`,
        dryRun
      };
    }

    if (!rulesetConfig.name) {
      return {
        repository: repo,
        success: false,
        error: `Ruleset configuration in "${filePath}" must include a "name" field.`,
        dryRun
      };
    }

    rulesetConfigs.push(rulesetConfig);
  }

  // Validate no duplicate ruleset names across files
  const nameCount = new Map();
  for (const config of rulesetConfigs) {
    nameCount.set(config.name, (nameCount.get(config.name) || 0) + 1);
  }
  const duplicates = [...nameCount.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (duplicates.length > 0) {
    return {
      repository: repo,
      success: false,
      error: `Duplicate ruleset name(s) found across files: ${duplicates.join(', ')}. Each ruleset file must have a unique name.`,
      dryRun
    };
  }

  // Collect managed names for delete-unmanaged logic
  const managedNames = new Set(rulesetConfigs.map(r => r.name));

  // Get existing rulesets for the repository (once for all files)
  // Use includes_parents=false to exclude organization-level rulesets
  let existingRulesets = [];
  try {
    existingRulesets = await octokit.paginate(octokit.rest.repos.getRepoRulesets, {
      owner,
      repo: repoName,
      per_page: 100,
      includes_parents: false
    });
  } catch (error) {
    if (error.status === 404) {
      core.info(`  📋 Repository ${repo} does not have rulesets enabled or accessible`);
    } else {
      return {
        repository: repo,
        success: false,
        error: `Failed to sync ruleset: ${error.message}`,
        dryRun
      };
    }
  }

  // Process each desired ruleset
  for (const rulesetConfig of rulesetConfigs) {
    const rulesetName = rulesetConfig.name;
    const existingRuleset = existingRulesets.find(r => r.name === rulesetName);

    if (existingRuleset) {
      // Fetch full ruleset details to compare
      let fullRuleset;
      try {
        ({ data: fullRuleset } = await octokit.rest.repos.getRepoRuleset({
          owner,
          repo: repoName,
          ruleset_id: existingRuleset.id
        }));
      } catch (error) {
        core.warning(`  ⚠️  Failed to fetch ruleset "${rulesetName}" (ID: ${existingRuleset.id}): ${error.message}`);
        const warnSub = createSubResult(
          'ruleset-update',
          SubResultStatus.WARNING,
          `Failed to fetch "${rulesetName}" (ID: ${existingRuleset.id}): ${error.message}`
        );
        warnSub.rulesetId = existingRuleset.id;
        warnSub.rulesetName = rulesetName;
        subResults.push(warnSub);
        continue;
      }

      const existingConfig = stripRulesetReadonlyFields(fullRuleset);
      const normalizedSourceConfig = stripRulesetReadonlyFields(rulesetConfig);
      const configsMatch = deepEqual(existingConfig, normalizedSourceConfig);

      if (configsMatch) {
        core.info(`  📋 Ruleset "${rulesetName}" is already up to date`);
      } else {
        core.info(`  📋 ${wouldPrefix}Update ruleset: ${rulesetName} (ID: ${existingRuleset.id})`);
        subResults.push(
          createSubResult(
            'ruleset-update',
            SubResultStatus.CHANGED,
            `${wouldPrefix}update "${rulesetName}" (ID: ${existingRuleset.id})`
          )
        );
        subResults[subResults.length - 1].rulesetId = existingRuleset.id;
        subResults[subResults.length - 1].rulesetName = rulesetName;

        if (!dryRun) {
          try {
            await octokit.rest.repos.updateRepoRuleset({
              ...stripRulesetReadonlyFields(rulesetConfig),
              owner,
              repo: repoName,
              ruleset_id: existingRuleset.id
            });
          } catch (error) {
            core.warning(`  ⚠️  Failed to update ruleset "${rulesetName}": ${error.message}`);
            const warnSub = createSubResult(
              'ruleset-update',
              SubResultStatus.WARNING,
              `Failed to update "${rulesetName}": ${error.message}`
            );
            warnSub.rulesetId = existingRuleset.id;
            warnSub.rulesetName = rulesetName;
            subResults[subResults.length - 1] = warnSub;
          }
        }
      }
    } else {
      core.info(`  🆕 ${wouldPrefix}Create ruleset: ${rulesetName}`);
      const createSub = createSubResult(
        'ruleset-create',
        SubResultStatus.CHANGED,
        `${wouldPrefix}create "${rulesetName}"`
      );
      createSub.rulesetName = rulesetName;
      subResults.push(createSub);

      if (!dryRun) {
        try {
          const { data: newRuleset } = await octokit.rest.repos.createRepoRuleset({
            ...stripRulesetReadonlyFields(rulesetConfig),
            owner,
            repo: repoName
          });
          core.info(`  📋 Created ruleset "${rulesetName}" (ID: ${newRuleset.id})`);
          subResults[subResults.length - 1].rulesetId = newRuleset.id;
        } catch (error) {
          core.warning(`  ⚠️  Failed to create ruleset "${rulesetName}": ${error.message}`);
          const warnSub = createSubResult(
            'ruleset-create',
            SubResultStatus.WARNING,
            `Failed to create "${rulesetName}": ${error.message}`
          );
          warnSub.rulesetName = rulesetName;
          subResults[subResults.length - 1] = warnSub;
        }
      }
    }
  }

  // Delete unmanaged rulesets (those not in the managed set)
  if (deleteUnmanaged) {
    for (const existing of existingRulesets) {
      if (!managedNames.has(existing.name)) {
        core.info(`  🗑️ ${wouldPrefix}Delete ruleset: ${existing.name} (ID: ${existing.id})`);
        const deleteSub = createSubResult(
          'ruleset-delete',
          SubResultStatus.CHANGED,
          `${wouldPrefix}delete "${existing.name}" (ID: ${existing.id})`
        );
        deleteSub.rulesetName = existing.name;
        deleteSub.rulesetId = existing.id;
        subResults.push(deleteSub);

        if (!dryRun) {
          try {
            await octokit.rest.repos.deleteRepoRuleset({
              owner,
              repo: repoName,
              ruleset_id: existing.id
            });
          } catch (error) {
            core.warning(`  ⚠️  Failed to delete ruleset "${existing.name}": ${error.message}`);
            const warnSub = createSubResult(
              'ruleset-delete',
              SubResultStatus.WARNING,
              `Failed to delete "${existing.name}": ${error.message}`
            );
            warnSub.rulesetName = existing.name;
            warnSub.rulesetId = existing.id;
            subResults[subResults.length - 1] = warnSub;
          }
        }
      }
    }
  }

  // Build backward-compatible result
  const hasChanges = subResults.some(s => s.status === SubResultStatus.CHANGED);
  const hasWarnings = subResults.some(s => s.status === SubResultStatus.WARNING);

  // Determine aggregate status from non-delete operations
  const syncSubResults = subResults.filter(s => s.kind !== 'ruleset-delete');
  const hasSyncChanges = syncSubResults.some(s => s.status === SubResultStatus.CHANGED);

  let ruleset = 'unchanged';
  let message = `All ${rulesetConfigs.length} ruleset(s) are already up to date`;

  if (hasSyncChanges) {
    const firstChanged = syncSubResults.find(s => s.status === SubResultStatus.CHANGED);
    if (firstChanged.kind === 'ruleset-create') {
      ruleset = dryRun ? 'would-create' : 'created';
    } else {
      ruleset = dryRun ? 'would-update' : 'updated';
    }
  }

  if (hasChanges || hasWarnings) {
    const messages = subResults.map(s => s.message);
    message = messages.join('; ');
  }

  const result = {
    repository: repo,
    success: true,
    ruleset,
    message,
    subResults,
    dryRun
  };

  // Preserve rulesetId for backward compat
  const firstCreateOrUpdate = subResults.find(
    s => (s.kind === 'ruleset-create' || s.kind === 'ruleset-update') && s.rulesetId
  );
  if (firstCreateOrUpdate) {
    result.rulesetId = firstCreateOrUpdate.rulesetId;
  } else if (rulesetConfigs.length > 0) {
    // For unchanged rulesets, find the existing ID
    const firstExisting = existingRulesets.find(r => managedNames.has(r.name));
    if (firstExisting) {
      result.rulesetId = firstExisting.id;
    }
  }

  // Preserve deletedRulesets for backward compat
  const deleteSubResults = subResults.filter(s => s.kind === 'ruleset-delete');
  if (deleteSubResults.length > 0) {
    result.deletedRulesets = deleteSubResults.map(s => {
      const isWarning = s.status === SubResultStatus.WARNING;
      const isDryRun = s.message.startsWith('Would');
      return {
        name: s.rulesetName,
        id: s.rulesetId,
        deleted: !isWarning && !isDryRun,
        ...(isDryRun && { wouldDelete: true }),
        ...(isWarning && { error: s.message })
      };
    });
  }

  return result;
}

/**
 * Sync a single repository ruleset to target repository (backward-compatible wrapper).
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} rulesetFilePath - Path to local ruleset JSON file
 * @param {boolean} deleteUnmanaged - Delete all other rulesets besides the one being synced
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncRepositoryRuleset(octokit, repo, rulesetFilePath, deleteUnmanaged, dryRun) {
  return syncRepositoryRulesets(octokit, repo, [rulesetFilePath], deleteUnmanaged, dryRun);
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
 * Normalize an existing environment from the API response into a comparable format.
 * Extracts wait_timer and reviewers from protection_rules.
 * @param {Object} env - Environment object from the API
 * @returns {Object} Normalized environment settings
 */
export function normalizeExistingEnvironment(env) {
  const normalized = {
    name: env.name,
    wait_timer: 0,
    prevent_self_review: false,
    reviewers: [],
    deployment_branch_policy: env.deployment_branch_policy ?? null
  };

  if (Array.isArray(env.protection_rules)) {
    for (const rule of env.protection_rules) {
      if (rule.type === 'wait_timer') {
        normalized.wait_timer = rule.wait_timer ?? 0;
      } else if (rule.type === 'required_reviewers') {
        if (Array.isArray(rule.reviewers)) {
          normalized.reviewers = rule.reviewers.map(r => ({
            type: r.type,
            id: r.reviewer?.id
          }));
        }
        normalized.prevent_self_review = rule.prevent_self_review ?? false;
      }
    }
  }

  // Sort reviewers by type and id for consistent comparison
  normalized.reviewers.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.id ?? 0) - (b.id ?? 0);
  });

  return normalized;
}

/**
 * Resolve a reviewer entry to include a numeric ID.
 * If the reviewer has a `login` (User) or `slug` (Team), resolves to the numeric ID via API.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository/org owner
 * @param {Object} reviewer - Reviewer object with type and either id, login, or slug
 * @returns {Promise<Object>} Reviewer with resolved id
 */
async function resolveReviewer(octokit, owner, reviewer) {
  if (reviewer.id) return { type: reviewer.type, id: reviewer.id };

  if (reviewer.type === 'User' && reviewer.login) {
    try {
      const { data } = await octokit.rest.users.getByUsername({ username: reviewer.login });
      return { type: 'User', id: data.id };
    } catch (error) {
      throw new Error(`Failed to resolve User login "${reviewer.login}": ${error.message}`);
    }
  }

  if (reviewer.type === 'Team' && reviewer.slug) {
    try {
      const { data } = await octokit.rest.teams.getByName({ org: owner, team_slug: reviewer.slug });
      return { type: 'Team', id: data.id };
    } catch (error) {
      throw new Error(`Failed to resolve Team slug "${reviewer.slug}" in org "${owner}": ${error.message}`);
    }
  }

  throw new Error(
    `Reviewer must have an "id", or "login" (for User) / "slug" (for Team). Got: ${JSON.stringify(reviewer)}`
  );
}

/**
 * Resolve all reviewers in an environment config, converting friendly names to IDs.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository/org owner
 * @param {Array<Object>} reviewers - Array of reviewer objects
 * @returns {Promise<Array<Object>>} Reviewers with resolved IDs
 */
async function resolveReviewers(octokit, owner, reviewers) {
  if (!reviewers || reviewers.length === 0) return [];
  return Promise.all(reviewers.map(r => resolveReviewer(octokit, owner, r)));
}

/**
 * Sync deployment protection rules for an environment.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repoName - Repository name
 * @param {string} envName - Environment name
 * @param {Array<Object>} desiredRules - Desired protection rules (each with `app` slug)
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Array<Object>>} Array of subResults for rule operations
 */
async function syncDeploymentProtectionRules(octokit, owner, repoName, envName, desiredRules, dryRun) {
  const subResults = [];
  const wouldPrefix = dryRun ? 'Would ' : '';

  // Get available apps for this environment
  let availableApps = [];
  try {
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/apps',
      { owner, repo: repoName, environment_name: envName }
    );
    availableApps = data.available_custom_deployment_protection_rule_integrations ?? [];
  } catch (error) {
    core.warning(`  ⚠️  Failed to list available deployment protection rule apps for ${envName}: ${error.message}`);
    return subResults;
  }

  // Resolve app slugs to integration IDs
  const resolvedRules = [];
  for (const rule of desiredRules) {
    const app = availableApps.find(a => a.slug === rule.app);
    if (!app) {
      core.warning(
        `  ⚠️  Deployment protection rule app "${rule.app}" not found for environment ${envName}. ` +
          `Available apps: ${availableApps.map(a => a.slug).join(', ') || 'none'}`
      );
      subResults.push(
        createSubResult(
          'environment-protection-rule',
          SubResultStatus.WARNING,
          `App "${rule.app}" not available for ${envName}`
        )
      );
      continue;
    }
    resolvedRules.push({ integration_id: app.id, slug: rule.app });
  }

  // Get existing protection rules
  let existingRules = [];
  try {
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules',
      { owner, repo: repoName, environment_name: envName }
    );
    existingRules = data.custom_deployment_protection_rules ?? [];
  } catch (error) {
    core.warning(`  ⚠️  Failed to list deployment protection rules for ${envName}: ${error.message}`);
    existingRules = [];
  }

  const existingAppIds = new Set(existingRules.map(r => r.app?.id));
  const desiredAppIds = new Set(resolvedRules.map(r => r.integration_id));

  // Create missing rules
  for (const rule of resolvedRules) {
    if (!existingAppIds.has(rule.integration_id)) {
      core.info(`  🛡️ ${wouldPrefix}Add deployment gate: ${rule.slug}`);
      subResults.push(
        createSubResult(
          'environment-protection-rule',
          SubResultStatus.CHANGED,
          `${wouldPrefix}add deployment gate "${rule.slug}" to ${envName}`
        )
      );
      if (!dryRun) {
        try {
          await octokit.request(
            'POST /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules',
            { owner, repo: repoName, environment_name: envName, integration_id: rule.integration_id }
          );
        } catch (error) {
          core.warning(`  ⚠️  Failed to add deployment gate "${rule.slug}": ${error.message}`);
          subResults[subResults.length - 1] = createSubResult(
            'environment-protection-rule',
            SubResultStatus.WARNING,
            `Failed to add deployment gate "${rule.slug}": ${error.message}`
          );
        }
      }
    }
  }

  // Delete rules not in desired set
  for (const existing of existingRules) {
    if (existing.app?.id && !desiredAppIds.has(existing.app.id)) {
      const appSlug = existing.app?.slug ?? `ID ${existing.app?.id}`;
      core.info(`  🗑️ ${wouldPrefix}Remove deployment gate: ${appSlug}`);
      subResults.push(
        createSubResult(
          'environment-protection-rule',
          SubResultStatus.CHANGED,
          `${wouldPrefix}remove deployment gate "${appSlug}" from ${envName}`
        )
      );
      if (!dryRun) {
        try {
          await octokit.request(
            'DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/{protection_rule_id}',
            { owner, repo: repoName, environment_name: envName, protection_rule_id: existing.id }
          );
        } catch (error) {
          core.warning(`  ⚠️  Failed to remove deployment gate "${appSlug}": ${error.message}`);
          subResults[subResults.length - 1] = createSubResult(
            'environment-protection-rule',
            SubResultStatus.WARNING,
            `Failed to remove deployment gate "${appSlug}": ${error.message}`
          );
        }
      }
    }
  }

  return subResults;
}

export function normalizeDesiredEnvironment(env) {
  const normalized = {
    name: env.name,
    wait_timer: env.wait_timer ?? 0,
    prevent_self_review: env.prevent_self_review ?? false,
    reviewers: (env.reviewers ?? []).map(r => ({ type: r.type, id: r.id })),
    deployment_branch_policy: env.deployment_branch_policy ?? null
  };

  // Sort reviewers by type and id for consistent comparison
  normalized.reviewers.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.id ?? 0) - (b.id ?? 0);
  });

  return normalized;
}

/**
 * Compare two arrays of reviewer objects for equality.
 * Assumes both arrays are already sorted by type and id.
 * @param {Array} a - First reviewers array
 * @param {Array} b - Second reviewers array
 * @returns {boolean} True if reviewers are equal
 */
function reviewersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].id !== b[i].id) return false;
  }
  return true;
}

/**
 * Sync custom deployment branch policies (name patterns) for an environment.
 * Only runs when custom_branch_policies is true in the environment config.
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repoName - Repository name
 * @param {string} envName - Environment name
 * @param {Array<string>} desiredPatterns - Desired branch/tag name patterns
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Array<Object>>} Array of subResults
 */
async function syncDeploymentBranchPolicies(octokit, owner, repoName, envName, desiredPatterns, dryRun) {
  const subResults = [];
  const wouldPrefix = dryRun ? 'Would ' : '';

  // Get existing branch policies
  let existingPolicies = [];
  try {
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies',
      { owner, repo: repoName, environment_name: envName }
    );
    existingPolicies = data.branch_policies ?? [];
  } catch (error) {
    core.warning(`  ⚠️  Failed to list deployment branch policies for ${envName}: ${error.message}`);
    return subResults;
  }

  const existingNames = new Set(existingPolicies.map(p => p.name));
  const desiredNames = new Set(desiredPatterns);

  // Create missing policies
  for (const pattern of desiredPatterns) {
    if (!existingNames.has(pattern)) {
      core.info(`  🌿 ${wouldPrefix}Add branch policy: ${pattern} to ${envName}`);
      subResults.push(
        createSubResult(
          'environment-branch-policy',
          SubResultStatus.CHANGED,
          `${wouldPrefix}add branch policy "${pattern}" to ${envName}`
        )
      );
      if (!dryRun) {
        await octokit.request('POST /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies', {
          owner,
          repo: repoName,
          environment_name: envName,
          name: pattern
        });
      }
    }
  }

  // Delete policies not in desired list
  for (const policy of existingPolicies) {
    if (!desiredNames.has(policy.name)) {
      core.info(`  🌿 ${wouldPrefix}Remove branch policy: ${policy.name} from ${envName}`);
      subResults.push(
        createSubResult(
          'environment-branch-policy',
          SubResultStatus.CHANGED,
          `${wouldPrefix}remove branch policy "${policy.name}" from ${envName}`
        )
      );
      if (!dryRun) {
        await octokit.request(
          'DELETE /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies/{branch_policy_id}',
          { owner, repo: repoName, environment_name: envName, branch_policy_id: policy.id }
        );
      }
    }
  }

  return subResults;
}

/**
 * Compare two deployment branch policy objects for equality.
 * @param {Object|null} a - First branch policy
 * @param {Object|null} b - Second branch policy
 * @returns {boolean} True if branch policies are equal
 */
function branchPoliciesEqual(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.protected_branches === b.protected_branches && a.custom_branch_policies === b.custom_branch_policies;
}

/**
 * Compare two normalized environments for equality.
 * @param {Object} a - First normalized environment
 * @param {Object} b - Second normalized environment
 * @returns {boolean} True if environments have the same settings
 */
export function environmentsEqual(a, b) {
  if (a.wait_timer !== b.wait_timer) return false;
  if (a.prevent_self_review !== b.prevent_self_review) return false;
  if (!reviewersEqual(a.reviewers, b.reviewers)) return false;
  if (!branchPoliciesEqual(a.deployment_branch_policy, b.deployment_branch_policy)) return false;
  return true;
}

/**
 * Build PUT request parameters for creating or updating an environment.
 * @param {string} owner - Repository owner
 * @param {string} repoName - Repository name
 * @param {Object} env - Environment config object
 * @returns {Object} Request parameters
 */
function buildEnvironmentParams(owner, repoName, env) {
  const params = {
    owner,
    repo: repoName,
    environment_name: env.name,
    wait_timer: env.wait_timer ?? 0,
    prevent_self_review: env.prevent_self_review ?? false,
    reviewers: env.reviewers ?? [],
    deployment_branch_policy: env.deployment_branch_policy ?? null
  };
  return params;
}

/**
 * Parse environments configuration from various input formats.
 * Accepts a comma-separated string of names, a YAML/JSON file path, or both.
 * @param {string} [environmentNames] - Comma-separated environment names (inline input)
 * @param {string} [environmentsFilePath] - Path to YAML or JSON environments config file
 * @returns {Array<Object>} Array of environment config objects (each with at least a name)
 */
export function parseEnvironmentsConfig(environmentNames, environmentsFilePath) {
  const environments = [];

  // Parse inline environment names (simple comma-separated list, deduplicated)
  if (environmentNames) {
    const names = [
      ...new Set(
        environmentNames
          .split(',')
          .map(n => n.trim())
          .filter(n => n.length > 0)
      )
    ];
    for (const name of names) {
      environments.push({ name });
    }
  }

  // Parse environments file (YAML or JSON)
  if (environmentsFilePath) {
    const fileContent = fs.readFileSync(environmentsFilePath, 'utf8');
    let parsed;

    // Try YAML first, fall back to JSON
    try {
      parsed = yaml.load(fileContent);
    } catch {
      parsed = JSON.parse(fileContent);
    }

    const fileEnvs = Array.isArray(parsed?.environments) ? parsed.environments : Array.isArray(parsed) ? parsed : [];
    if (fileEnvs.length === 0) {
      throw new Error(
        `Environments config file "${environmentsFilePath}" must contain an "environments" array or be a YAML/JSON array`
      );
    }

    // Check for duplicate names within the file
    const fileNames = fileEnvs.filter(e => e.name).map(e => e.name);
    const fileDuplicates = fileNames.filter((name, idx) => fileNames.indexOf(name) !== idx);
    if (fileDuplicates.length > 0) {
      throw new Error(
        `Duplicate environment name(s) in "${environmentsFilePath}": ${[...new Set(fileDuplicates)].join(', ')}`
      );
    }

    // File environments override inline ones with the same name
    const inlineNames = new Set(environments.map(e => e.name));
    for (const env of fileEnvs) {
      if (!env.name || typeof env.name !== 'string') {
        throw new Error(`Each environment in "${environmentsFilePath}" must have a "name" field`);
      }
      if (inlineNames.has(env.name)) {
        // Replace inline entry with richer file entry
        const idx = environments.findIndex(e => e.name === env.name);
        environments[idx] = env;
      } else {
        environments.push(env);
      }
    }
  }

  return environments;
}

/**
 * Sync environments to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {Array<Object>} environmentsList - Array of environment config objects
 * @param {boolean} deleteUnmanaged - Delete environments not in the config
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @returns {Promise<Object>} Result object
 */
export async function syncEnvironments(octokit, repo, environmentsList, deleteUnmanaged, dryRun) {
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
    // Validate each environment entry has a name
    for (const env of environmentsList) {
      if (!env.name || typeof env.name !== 'string') {
        return {
          repository: repo,
          success: false,
          error: 'Each environment must have a "name" field.',
          dryRun
        };
      }
    }

    // Resolve reviewer friendly names to IDs
    const resolvedEnvironments = [];
    for (const env of environmentsList) {
      const resolved = { ...env };
      if (resolved.reviewers && resolved.reviewers.length > 0) {
        try {
          resolved.reviewers = await resolveReviewers(octokit, owner, resolved.reviewers);
        } catch (error) {
          return {
            repository: repo,
            success: false,
            error: `Failed to resolve reviewers for environment "${env.name}": ${error.message}`,
            dryRun
          };
        }
      }
      resolvedEnvironments.push(resolved);
    }

    // Get existing environments for the repository (paginated)
    const existingEnvironments = [];
    try {
      let page = 1;
      const perPage = 30;
      let hasMore = true;
      while (hasMore) {
        const response = await octokit.request('GET /repos/{owner}/{repo}/environments', {
          owner,
          repo: repoName,
          per_page: perPage,
          page
        });
        const envs = response.data.environments ?? [];
        existingEnvironments.push(...envs);
        hasMore = envs.length === perPage;
        page++;
      }
    } catch (error) {
      if (error.status === 404) {
        core.info(`  🌍 Repository ${repo} does not have environments accessible`);
      } else {
        throw error;
      }
    }

    // Normalize environments for comparison
    const normalizedExisting = new Map(existingEnvironments.map(env => [env.name, normalizeExistingEnvironment(env)]));

    const environmentsToCreate = [];
    const environmentsToUpdate = [];
    const environmentsUnchanged = [];
    const environmentsToDelete = [];

    // Compare desired with existing
    for (const desiredEnv of resolvedEnvironments) {
      const normalizedDesired = normalizeDesiredEnvironment(desiredEnv);
      const existing = normalizedExisting.get(desiredEnv.name);

      if (!existing) {
        environmentsToCreate.push(normalizedDesired);
      } else if (!environmentsEqual(normalizedDesired, existing)) {
        environmentsToUpdate.push(normalizedDesired);
      } else {
        environmentsUnchanged.push(normalizedDesired);
      }
    }

    // Find environments to delete (exist in repo but not in config)
    if (deleteUnmanaged) {
      const desiredNames = new Set(resolvedEnvironments.map(e => e.name));
      for (const existingEnv of existingEnvironments) {
        if (!desiredNames.has(existingEnv.name)) {
          environmentsToDelete.push(existingEnv);
        }
      }
    }

    // Check for deployment protection rules on any desired environments
    const envsWithProtectionRules = resolvedEnvironments.filter(e => e.deployment_protection_rules !== undefined);

    // Check for custom branch patterns to sync
    const envsWithBranchPatterns = resolvedEnvironments.filter(
      e => e.deployment_branch_policy?.custom_branch_policies === true && Array.isArray(e.branch_name_patterns)
    );

    // If no environment changes, no protection rules, and no branch patterns to sync, return early
    if (
      environmentsToCreate.length === 0 &&
      environmentsToUpdate.length === 0 &&
      environmentsToDelete.length === 0 &&
      envsWithProtectionRules.length === 0 &&
      envsWithBranchPatterns.length === 0
    ) {
      return {
        repository: repo,
        success: true,
        environments: 'unchanged',
        message: `All ${environmentsUnchanged.length} environment(s) are already up to date`,
        environmentsUnchanged: environmentsUnchanged.length,
        dryRun
      };
    }

    if (dryRun) {
      const message = [];
      if (environmentsToCreate.length > 0) {
        message.push(`Would create ${environmentsToCreate.length} environment(s)`);
      }
      if (environmentsToUpdate.length > 0) {
        message.push(`Would update ${environmentsToUpdate.length} environment(s)`);
      }
      if (environmentsToDelete.length > 0) {
        message.push(`Would delete ${environmentsToDelete.length} environment(s)`);
      }
      if (envsWithProtectionRules.length > 0) {
        message.push(`Would sync deployment protection rules for ${envsWithProtectionRules.length} environment(s)`);
      }
      if (envsWithBranchPatterns.length > 0) {
        message.push(`Would sync branch policies for ${envsWithBranchPatterns.length} environment(s)`);
      }
      return {
        repository: repo,
        success: true,
        environments: 'would-update',
        message: message.join(', '),
        environmentsWouldCreate: environmentsToCreate.map(e => e.name),
        environmentsWouldUpdate: environmentsToUpdate.map(e => e.name),
        environmentsWouldDelete: environmentsToDelete.map(e => e.name),
        environmentsUnchanged: environmentsUnchanged.length,
        dryRun
      };
    }

    // Create new environments
    for (const env of environmentsToCreate) {
      await octokit.request(
        'PUT /repos/{owner}/{repo}/environments/{environment_name}',
        buildEnvironmentParams(owner, repoName, env)
      );
      core.info(`  🌍 Created environment: ${env.name}`);
    }

    // Update existing environments
    for (const env of environmentsToUpdate) {
      await octokit.request(
        'PUT /repos/{owner}/{repo}/environments/{environment_name}',
        buildEnvironmentParams(owner, repoName, env)
      );
      core.info(`  🌍 Updated environment: ${env.name}`);
    }

    // Delete unmanaged environments
    for (const env of environmentsToDelete) {
      await octokit.request('DELETE /repos/{owner}/{repo}/environments/{environment_name}', {
        owner,
        repo: repoName,
        environment_name: env.name
      });
      core.info(`  🌍 Deleted environment: ${env.name}`);
    }

    // Sync custom deployment branch policies for environments that use them
    const branchPolicySubResults = [];
    for (const env of envsWithBranchPatterns) {
      const policyResults = await syncDeploymentBranchPolicies(
        octokit,
        owner,
        repoName,
        env.name,
        env.branch_name_patterns,
        dryRun
      );
      branchPolicySubResults.push(...policyResults);
    }

    // Sync deployment protection rules for environments that define them
    const protectionRuleSubResults = [];
    for (const env of envsWithProtectionRules) {
      const ruleResults = await syncDeploymentProtectionRules(
        octokit,
        owner,
        repoName,
        env.name,
        env.deployment_protection_rules ?? [],
        dryRun
      );
      protectionRuleSubResults.push(...ruleResults);
    }

    const hasProtectionChanges = protectionRuleSubResults.some(s => s.status === SubResultStatus.CHANGED);
    const hasProtectionWarnings = protectionRuleSubResults.some(s => s.status === SubResultStatus.WARNING);
    const hasBranchPolicyChanges = branchPolicySubResults.some(s => s.status === SubResultStatus.CHANGED);

    // If nothing changed across environments, protection rules, or branch policies
    if (
      environmentsToCreate.length === 0 &&
      environmentsToUpdate.length === 0 &&
      environmentsToDelete.length === 0 &&
      !hasProtectionChanges &&
      !hasBranchPolicyChanges
    ) {
      return {
        repository: repo,
        success: true,
        environments: 'unchanged',
        message: `All ${resolvedEnvironments.length} environment(s) are already up to date`,
        environmentsUnchanged: environmentsUnchanged.length,
        protectionRuleSubResults,
        dryRun
      };
    }

    const message = [];
    if (environmentsToCreate.length > 0) {
      message.push(`Created ${environmentsToCreate.length} environment(s)`);
    }
    if (environmentsToUpdate.length > 0) {
      message.push(`Updated ${environmentsToUpdate.length} environment(s)`);
    }
    if (environmentsToDelete.length > 0) {
      message.push(`Deleted ${environmentsToDelete.length} environment(s)`);
    }
    if (hasProtectionChanges) {
      message.push(`Updated deployment protection rules`);
    }
    if (hasProtectionWarnings) {
      message.push(`Some deployment protection rule updates had warnings`);
    }
    if (hasBranchPolicyChanges) {
      message.push(`Updated deployment branch policies`);
    }

    return {
      repository: repo,
      success: true,
      environments: dryRun ? 'would-update' : 'updated',
      message: message.join(', '),
      environmentsCreated: environmentsToCreate.map(e => e.name),
      environmentsUpdated: environmentsToUpdate.map(e => e.name),
      environmentsDeleted: environmentsToDelete.map(e => e.name),
      environmentsUnchanged: environmentsUnchanged.length,
      protectionRuleSubResults,
      branchPolicySubResults,
      dryRun
    };
  } catch (error) {
    return {
      repository: repo,
      success: false,
      error: `Failed to sync environments: ${error.message}`,
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
 * Sync CODEOWNERS file to target repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} repo - Repository in "owner/repo" format
 * @param {string} codeownersPath - Path to local CODEOWNERS file
 * @param {string} targetPath - Target path in the repository (.github/CODEOWNERS, CODEOWNERS, or docs/CODEOWNERS)
 * @param {string} prTitle - Title for the pull request
 * @param {boolean} dryRun - Preview mode without making actual changes
 * @param {Object} [templateVars] - Optional template variables for {{variable}} replacement
 * @returns {Promise<Object>} Result object
 */
export async function syncCodeowners(octokit, repo, codeownersPath, targetPath, prTitle, dryRun, templateVars = null) {
  // Validate target path
  const validPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
  if (!validPaths.includes(targetPath)) {
    return {
      repository: repo,
      success: false,
      error: `Invalid CODEOWNERS target path: ${targetPath}. Must be one of: ${validPaths.join(', ')}`,
      dryRun
    };
  }

  // Create content transformer if template variables are provided
  const contentTransformer =
    templateVars &&
    typeof templateVars === 'object' &&
    !Array.isArray(templateVars) &&
    Object.keys(templateVars).length > 0
      ? content => replaceTemplateVariables(content, templateVars)
      : null;

  return syncFileViaPullRequest(
    octokit,
    repo,
    {
      sourceFilePath: codeownersPath,
      targetPath,
      branchName: 'codeowners-sync',
      prTitle,
      prBodyCreate: `This PR adds \`${targetPath}\` to define code ownership.\n\n**Changes:**\n- Added CODEOWNERS file`,
      prBodyUpdate: `This PR updates \`${targetPath}\` to the latest version.\n\n**Changes:**\n- Updated CODEOWNERS file`,
      resultKey: 'codeowners',
      fileDescription: 'CODEOWNERS',
      contentTransformer
    },
    dryRun
  );
}

/**
 * Check if a repository result has any changes
 * @param {Object} result - Repository update result object
 * @returns {boolean} True if there are any changes
 */
function hasRepositoryChanges(result) {
  if (result.subResults && result.subResults.length > 0) {
    return result.subResults.some(s => s.status === SubResultStatus.CHANGED);
  }
  return false;
}

/**
 * Main action logic
 */
export async function run() {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token');
    const githubApiUrl = core.getInput('github-api-url') || 'https://api.github.com';
    const repositories = core.getInput('repositories');
    const repositoriesFile = core.getInput('repositories-file');
    const owner = core.getInput('owner');
    const customPropertyName = core.getInput('custom-property-name');
    const customPropertyValue = core.getInput('custom-property-value');

    // Get settings inputs
    const settings = {
      allow_squash_merge: getBooleanInput('allow-squash-merge'),
      squash_merge_commit_title: getEnumInput('squash-merge-commit-title', ['PR_TITLE', 'COMMIT_OR_PR_TITLE']),
      squash_merge_commit_message: getEnumInput('squash-merge-commit-message', ['PR_BODY', 'COMMIT_MESSAGES', 'BLANK']),
      allow_merge_commit: getBooleanInput('allow-merge-commit'),
      merge_commit_title: getEnumInput('merge-commit-title', ['PR_TITLE', 'MERGE_MESSAGE']),
      merge_commit_message: getEnumInput('merge-commit-message', ['PR_TITLE', 'PR_BODY', 'BLANK']),
      allow_rebase_merge: getBooleanInput('allow-rebase-merge'),
      allow_auto_merge: getBooleanInput('allow-auto-merge'),
      delete_branch_on_merge: getBooleanInput('delete-branch-on-merge'),
      allow_update_branch: getBooleanInput('allow-update-branch')
    };

    // Handle code-scanning with deprecated alias support
    const codeScanningNew = getBooleanInput('code-scanning');
    const codeScanningOld = getBooleanInput('enable-default-code-scanning');
    let enableCodeScanning = codeScanningNew;
    if (codeScanningOld !== null) {
      core.warning('The "enable-default-code-scanning" input is deprecated. Please use "code-scanning" instead.');
      if (codeScanningNew === null) {
        enableCodeScanning = codeScanningOld;
      }
    }
    const immutableReleases = getBooleanInput('immutable-releases');

    // Get security settings inputs
    const securitySettings = {
      secretScanning: getBooleanInput('secret-scanning'),
      secretScanningPushProtection: getBooleanInput('secret-scanning-push-protection'),
      privateVulnerabilityReporting: getBooleanInput('private-vulnerability-reporting'),
      dependabotAlerts: getBooleanInput('dependabot-alerts'),
      dependabotSecurityUpdates: getBooleanInput('dependabot-security-updates')
    };

    const dryRun = getBooleanInput('dry-run');
    const writeJobSummary = getBooleanInput('write-job-summary') !== false;
    const jobSummaryHeadingBase = core.getInput('summary-heading').trim();

    // Parse topics if provided
    const topicsInput = core.getInput('topics');
    const topics = topicsInput
      ? topicsInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
      : null;

    // Get dependabot.yml settings
    const dependabotYml = core.getInput('dependabot-yml');
    const dependabotPrTitle = core.getInput('dependabot-pr-title') || 'chore: update dependabot.yml';

    // Get .gitignore settings
    const gitignore = core.getInput('gitignore');
    const gitignorePrTitle = core.getInput('gitignore-pr-title') || 'chore: update .gitignore';

    // Get rulesets settings
    const rulesetsFileInput = core.getInput('rulesets-file');
    const rulesetsFiles = rulesetsFileInput ? parseRulesetsFileValue(rulesetsFileInput) : [];
    const deleteUnmanagedRulesets = getBooleanInput('delete-unmanaged-rulesets');

    // Get pull request template settings
    const pullRequestTemplate = core.getInput('pull-request-template');
    const pullRequestTemplatePrTitle =
      core.getInput('pull-request-template-pr-title') || 'chore: update pull request template';

    // Get workflow files settings
    const workflowFilesInput = core.getInput('workflow-files');
    const workflowFiles = workflowFilesInput
      ? workflowFilesInput
          .split(',')
          .map(f => f.trim())
          .filter(f => f.length > 0)
      : null;
    const workflowFilesPrTitle = core.getInput('workflow-files-pr-title') || 'chore: sync workflow configuration';

    // Get autolinks settings
    const autolinksFile = core.getInput('autolinks-file');

    // Get environments settings
    const environmentNames = core.getInput('environments');
    const environmentsFile = core.getInput('environments-file');
    const deleteUnmanagedEnvironments = getBooleanInput('delete-unmanaged-environments');
    let globalEnvironments = [];
    if (environmentNames || environmentsFile) {
      try {
        globalEnvironments = parseEnvironmentsConfig(environmentNames, environmentsFile);
      } catch (error) {
        throw new Error(`Failed to parse environments config: ${error.message}`);
      }
    }

    // Get copilot instructions settings
    const copilotInstructionsMd = core.getInput('copilot-instructions-md');
    const copilotInstructionsPrTitle =
      core.getInput('copilot-instructions-pr-title') || 'chore: update copilot-instructions.md';

    // Get CODEOWNERS settings
    const codeowners = core.getInput('codeowners');
    const codeownersTargetPath = core.getInput('codeowners-target-path') || '.github/CODEOWNERS';
    const codeownersPrTitle = core.getInput('codeowners-pr-title') || 'chore: update CODEOWNERS';

    // Get package.json sync settings
    const packageJsonFile = core.getInput('package-json-file');
    const syncScripts = getBooleanInput('package-json-sync-scripts');
    const syncEngines = getBooleanInput('package-json-sync-engines');
    const packageJsonPrTitle = core.getInput('package-json-pr-title') || 'chore: update package.json';

    core.info('Starting Bulk GitHub Repository Settings Action...');

    if (dryRun) {
      core.info('🔍 DRY-RUN MODE: No changes will be applied');
    }

    if (!githubToken) {
      throw new Error('github-token is required');
    }

    // Check if any settings are specified
    // Skip this check if repositoriesFile is provided (rules-based configs define settings in file)
    const hasSecuritySettings = Object.values(securitySettings).some(value => value !== null);
    const hasSettings =
      repositoriesFile ||
      Object.values(settings).some(value => value !== null) ||
      enableCodeScanning !== null ||
      immutableReleases !== null ||
      hasSecuritySettings ||
      topics !== null ||
      dependabotYml ||
      gitignore ||
      rulesetsFiles.length > 0 ||
      pullRequestTemplate ||
      (workflowFiles && workflowFiles.length > 0) ||
      autolinksFile ||
      globalEnvironments.length > 0 ||
      copilotInstructionsMd ||
      codeowners ||
      (packageJsonFile && (syncScripts || syncEngines));
    if (!hasSettings) {
      throw new Error(
        'At least one repository setting must be specified (or code-scanning must be true, or immutable-releases must be specified, or security settings must be specified, or topics must be provided, or dependabot-yml must be specified, or gitignore must be specified, or rulesets-file must be specified, or pull-request-template must be specified, or workflow-files must be specified, or autolinks-file must be specified, or environments must be specified, or copilot-instructions-md must be specified, or codeowners must be specified, or package-json-file with package-json-sync-scripts or package-json-sync-engines must be specified)'
      );
    }

    // Initialize Octokit
    const octokit = new Octokit({
      auth: githubToken,
      baseUrl: githubApiUrl
    });

    // Parse repository list
    const repoList = await parseRepositories(
      repositories,
      repositoriesFile,
      owner,
      octokit,
      customPropertyName,
      customPropertyValue
    );

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
    if (rulesetsFiles.length > 0) {
      core.info(`Repository rulesets will be synced from: ${rulesetsFiles.join(', ')}`);
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
    if (globalEnvironments.length > 0) {
      core.info(`Environments will be synced: ${globalEnvironments.map(e => e.name).join(', ')}`);
    }
    if (copilotInstructionsMd) {
      core.info(`Copilot-instructions.md will be synced from: ${copilotInstructionsMd}`);
    }
    if (codeowners) {
      core.info(`CODEOWNERS will be synced from: ${codeowners} to ${codeownersTargetPath}`);
    }
    if (securitySettings.secretScanning !== null) {
      core.info(`Secret scanning will be ${securitySettings.secretScanning ? 'enabled' : 'disabled'}`);
    }
    if (securitySettings.secretScanningPushProtection !== null) {
      core.info(
        `Secret scanning push protection will be ${securitySettings.secretScanningPushProtection ? 'enabled' : 'disabled'}`
      );
    }
    if (securitySettings.privateVulnerabilityReporting !== null) {
      core.info(
        `Private vulnerability reporting will be ${securitySettings.privateVulnerabilityReporting ? 'enabled' : 'disabled'}`
      );
    }
    if (securitySettings.dependabotAlerts !== null) {
      core.info(`Dependabot alerts will be ${securitySettings.dependabotAlerts ? 'enabled' : 'disabled'}`);
    }
    if (securitySettings.dependabotSecurityUpdates !== null) {
      core.info(
        `Dependabot security updates will be ${securitySettings.dependabotSecurityUpdates ? 'enabled' : 'disabled'}`
      );
    }

    // Update repositories
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let changedCount = 0;
    let warningCount = 0;

    for (const repoConfig of repoList) {
      const repo = repoConfig.repo;
      core.info(`Updating ${repo}...`);

      // Merge global settings with repo-specific overrides
      const repoSettings = {
        allow_squash_merge: coerceBooleanConfig(
          repoConfig['allow-squash-merge'],
          'allow-squash-merge',
          repo,
          settings.allow_squash_merge
        ),
        squash_merge_commit_title: coerceEnumConfig(
          repoConfig['squash-merge-commit-title'],
          'squash-merge-commit-title',
          repo,
          ['PR_TITLE', 'COMMIT_OR_PR_TITLE'],
          settings.squash_merge_commit_title
        ),
        squash_merge_commit_message: coerceEnumConfig(
          repoConfig['squash-merge-commit-message'],
          'squash-merge-commit-message',
          repo,
          ['PR_BODY', 'COMMIT_MESSAGES', 'BLANK'],
          settings.squash_merge_commit_message
        ),
        allow_merge_commit: coerceBooleanConfig(
          repoConfig['allow-merge-commit'],
          'allow-merge-commit',
          repo,
          settings.allow_merge_commit
        ),
        merge_commit_title: coerceEnumConfig(
          repoConfig['merge-commit-title'],
          'merge-commit-title',
          repo,
          ['PR_TITLE', 'MERGE_MESSAGE'],
          settings.merge_commit_title
        ),
        merge_commit_message: coerceEnumConfig(
          repoConfig['merge-commit-message'],
          'merge-commit-message',
          repo,
          ['PR_TITLE', 'PR_BODY', 'BLANK'],
          settings.merge_commit_message
        ),
        allow_rebase_merge: coerceBooleanConfig(
          repoConfig['allow-rebase-merge'],
          'allow-rebase-merge',
          repo,
          settings.allow_rebase_merge
        ),
        allow_auto_merge: coerceBooleanConfig(
          repoConfig['allow-auto-merge'],
          'allow-auto-merge',
          repo,
          settings.allow_auto_merge
        ),
        delete_branch_on_merge: coerceBooleanConfig(
          repoConfig['delete-branch-on-merge'],
          'delete-branch-on-merge',
          repo,
          settings.delete_branch_on_merge
        ),
        allow_update_branch: coerceBooleanConfig(
          repoConfig['allow-update-branch'],
          'allow-update-branch',
          repo,
          settings.allow_update_branch
        )
      };

      // Handle repo-specific code scanning (support both new and deprecated input names)
      const repoEnableCodeScanning =
        repoConfig['code-scanning'] !== undefined
          ? coerceBooleanConfig(repoConfig['code-scanning'], 'code-scanning', repo, enableCodeScanning)
          : repoConfig['enable-default-code-scanning'] !== undefined
            ? coerceBooleanConfig(
                repoConfig['enable-default-code-scanning'],
                'enable-default-code-scanning',
                repo,
                enableCodeScanning
              )
            : enableCodeScanning;

      // Handle repo-specific immutable releases
      const repoImmutableReleases = coerceBooleanConfig(
        repoConfig['immutable-releases'],
        'immutable-releases',
        repo,
        immutableReleases
      );

      // Handle repo-specific topics
      const repoTopics = (() => {
        if (repoConfig.topics === undefined) return topics;
        if (typeof repoConfig.topics === 'string') {
          return repoConfig.topics
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
        }
        if (Array.isArray(repoConfig.topics)) return repoConfig.topics;
        return null;
      })();

      // Handle repo-specific dependabot.yml
      const repoDependabotYml =
        repoConfig['dependabot-yml'] !== undefined ? repoConfig['dependabot-yml'] : dependabotYml;

      // Handle repo-specific .gitignore
      const repoGitignore = repoConfig['gitignore'] !== undefined ? repoConfig['gitignore'] : gitignore;

      // Handle repo-specific rulesets-file (supports comma-separated string or YAML array)
      const repoRulesetsFiles = (() => {
        if (repoConfig['rulesets-file'] === undefined) return rulesetsFiles;
        return parseRulesetsFileValue(repoConfig['rulesets-file'], repo);
      })();
      const repoDeleteUnmanagedRulesets = coerceBooleanConfig(
        repoConfig['delete-unmanaged-rulesets'],
        'delete-unmanaged-rulesets',
        repo,
        deleteUnmanagedRulesets
      );

      // Handle repo-specific pull-request-template
      const repoPullRequestTemplate =
        repoConfig['pull-request-template'] !== undefined ? repoConfig['pull-request-template'] : pullRequestTemplate;

      // Handle repo-specific workflow-files
      const repoWorkflowFiles = (() => {
        if (repoConfig['workflow-files'] === undefined) return workflowFiles;
        if (typeof repoConfig['workflow-files'] === 'string') {
          return repoConfig['workflow-files']
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
        }
        if (Array.isArray(repoConfig['workflow-files'])) return repoConfig['workflow-files'];
        return null;
      })();

      // Handle repo-specific autolinks-file
      const repoAutolinksFile =
        repoConfig['autolinks-file'] !== undefined ? repoConfig['autolinks-file'] : autolinksFile;

      // Handle repo-specific environments
      let repoEnvironments = globalEnvironments;
      if (repoConfig['environments'] !== undefined || repoConfig['environments-file'] !== undefined) {
        try {
          const repoEnvNames = repoConfig['environments'] !== undefined ? String(repoConfig['environments']) : null;
          const repoEnvFile = repoConfig['environments-file'] !== undefined ? repoConfig['environments-file'] : null;
          repoEnvironments = parseEnvironmentsConfig(repoEnvNames, repoEnvFile);
        } catch (error) {
          core.warning(
            `Failed to parse environments config for ${repo}: ${error.message}. Skipping environment sync for this repo.`
          );
          repoEnvironments = null;
        }
      }
      const repoDeleteUnmanagedEnvironments = coerceBooleanConfig(
        repoConfig['delete-unmanaged-environments'],
        'delete-unmanaged-environments',
        repo,
        deleteUnmanagedEnvironments
      );

      // Handle repo-specific copilot-instructions-md
      const repoCopilotInstructionsMd =
        repoConfig['copilot-instructions-md'] !== undefined
          ? repoConfig['copilot-instructions-md']
          : copilotInstructionsMd;

      // Handle repo-specific codeowners
      const repoCodeowners = repoConfig['codeowners'] !== undefined ? repoConfig['codeowners'] : codeowners;
      const repoCodeownersTargetPath =
        repoConfig['codeowners-target-path'] !== undefined
          ? repoConfig['codeowners-target-path']
          : codeownersTargetPath;
      // Handle repo-specific codeowners-vars (template variables)
      const repoCodeownersVars = (() => {
        if (repoConfig['codeowners-vars'] === undefined) return null;
        if (
          repoConfig['codeowners-vars'] !== null &&
          typeof repoConfig['codeowners-vars'] === 'object' &&
          !Array.isArray(repoConfig['codeowners-vars'])
        ) {
          return repoConfig['codeowners-vars'];
        }
        core.warning(
          `Invalid 'codeowners-vars' configuration for repo '${repo}'; expected an object. This configuration will be ignored.`
        );
        return null;
      })();

      // Handle repo-specific security settings
      const repoSecuritySettings = {
        secretScanning: coerceBooleanConfig(
          repoConfig['secret-scanning'],
          'secret-scanning',
          repo,
          securitySettings.secretScanning
        ),
        secretScanningPushProtection: coerceBooleanConfig(
          repoConfig['secret-scanning-push-protection'],
          'secret-scanning-push-protection',
          repo,
          securitySettings.secretScanningPushProtection
        ),
        privateVulnerabilityReporting: coerceBooleanConfig(
          repoConfig['private-vulnerability-reporting'],
          'private-vulnerability-reporting',
          repo,
          securitySettings.privateVulnerabilityReporting
        ),
        dependabotAlerts: coerceBooleanConfig(
          repoConfig['dependabot-alerts'],
          'dependabot-alerts',
          repo,
          securitySettings.dependabotAlerts
        ),
        dependabotSecurityUpdates: coerceBooleanConfig(
          repoConfig['dependabot-security-updates'],
          'dependabot-security-updates',
          repo,
          securitySettings.dependabotSecurityUpdates
        )
      };

      const result = await updateRepositorySettings(
        octokit,
        repo,
        repoSettings,
        repoEnableCodeScanning,
        repoImmutableReleases,
        repoTopics,
        repoSecuritySettings,
        dryRun
      );
      results.push(result);

      if (result.archived) {
        successCount++;
        core.info(`⏭️ Skipping archived repository ${repo}`);
        continue;
      }

      // TODO(v3): Remove legacy sync warning properties (e.g., dependabotSyncWarning, gitignoreSyncWarning)
      // and hasWarnings assignments below once consumers use subResults directly.
      // See: https://github.com/joshjohanning/bulk-github-repo-settings-sync-action/pull/120

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
          if (dependabotResult.dependabotYml && dependabotResult.dependabotYml !== 'unchanged') {
            result.subResults.push(
              createSubResult('dependabot-sync', SubResultStatus.CHANGED, dependabotResult.message, {
                syncStatus: dependabotResult.dependabotYml,
                prNumber: dependabotResult.prNumber,
                prUrl: dependabotResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.dependabotSyncWarning = dependabotResult.error;
          core.warning(`  ⚠️  ${dependabotResult.error}`);
          result.subResults.push(
            createSubResult('dependabot-sync', SubResultStatus.WARNING, 'Dependabot sync produced a warning')
          );
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
          if (gitignoreResult.gitignore && gitignoreResult.gitignore !== 'unchanged') {
            result.subResults.push(
              createSubResult('gitignore-sync', SubResultStatus.CHANGED, gitignoreResult.message, {
                syncStatus: gitignoreResult.gitignore,
                prNumber: gitignoreResult.prNumber,
                prUrl: gitignoreResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.gitignoreSyncWarning = gitignoreResult.error;
          core.warning(`  ⚠️  ${gitignoreResult.error}`);
          result.subResults.push(
            createSubResult('gitignore-sync', SubResultStatus.WARNING, 'Gitignore sync produced a warning')
          );
        }
      }

      // Sync repository rulesets if specified
      if (repoRulesetsFiles.length > 0) {
        core.info(`  📋 Checking repository rulesets...`);
        const rulesetResult = await syncRepositoryRulesets(
          octokit,
          repo,
          repoRulesetsFiles,
          repoDeleteUnmanagedRulesets,
          dryRun
        );

        // Add ruleset result to the main result
        result.rulesetSync = rulesetResult;

        if (rulesetResult.success) {
          core.info(`  📋 ${rulesetResult.message}`);
          // Propagate per-operation subResults from rulesets
          if (rulesetResult.subResults) {
            result.subResults.push(...rulesetResult.subResults);
          }
        } else {
          result.hasWarnings = true;
          result.rulesetSyncWarning = rulesetResult.error;
          core.warning(`  ⚠️  ${rulesetResult.error}`);
          result.subResults.push(
            createSubResult('ruleset-sync', SubResultStatus.WARNING, 'Ruleset sync produced a warning')
          );
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
          if (templateResult.pullRequestTemplate && templateResult.pullRequestTemplate !== 'unchanged') {
            result.subResults.push(
              createSubResult('pr-template-sync', SubResultStatus.CHANGED, templateResult.message, {
                syncStatus: templateResult.pullRequestTemplate,
                prNumber: templateResult.prNumber,
                prUrl: templateResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.pullRequestTemplateSyncWarning = templateResult.error;
          core.warning(`  ⚠️  ${templateResult.error}`);
          result.subResults.push(
            createSubResult('pr-template-sync', SubResultStatus.WARNING, 'PR template sync produced a warning')
          );
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
          if (workflowResult.workflowFiles && workflowResult.workflowFiles !== 'unchanged') {
            result.subResults.push(
              createSubResult('workflow-files-sync', SubResultStatus.CHANGED, workflowResult.message, {
                syncStatus: workflowResult.workflowFiles,
                prNumber: workflowResult.prNumber,
                prUrl: workflowResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.workflowFilesSyncWarning = workflowResult.error;
          core.warning(`  ⚠️  ${workflowResult.error}`);
          result.subResults.push(
            createSubResult('workflow-files-sync', SubResultStatus.WARNING, 'Workflow files sync produced a warning')
          );
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
          if (autolinksResult.autolinks && autolinksResult.autolinks !== 'unchanged') {
            result.subResults.push(
              createSubResult('autolinks-sync', SubResultStatus.CHANGED, autolinksResult.message, {
                syncStatus: autolinksResult.autolinks
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.autolinksSyncWarning = autolinksResult.error;
          core.warning(`  ⚠️  ${autolinksResult.error}`);
          result.subResults.push(
            createSubResult('autolinks-sync', SubResultStatus.WARNING, 'Autolinks sync produced a warning')
          );
        }
      }

      // Sync environments if specified
      if (repoEnvironments && repoEnvironments.length > 0) {
        core.info(`  🌍 Checking environments...`);
        const environmentsResult = await syncEnvironments(
          octokit,
          repo,
          repoEnvironments,
          repoDeleteUnmanagedEnvironments,
          dryRun
        );

        // Add environments result to the main result
        result.environmentsSync = environmentsResult;

        if (environmentsResult.success) {
          core.info(`  🌍 ${environmentsResult.message}`);
          if (environmentsResult.environments && environmentsResult.environments !== 'unchanged') {
            result.subResults.push(
              createSubResult('environments-sync', SubResultStatus.CHANGED, environmentsResult.message, {
                syncStatus: environmentsResult.environments
              })
            );
          }
          // Propagate protection rule and branch policy subResults
          if (environmentsResult.protectionRuleSubResults) {
            result.subResults.push(...environmentsResult.protectionRuleSubResults);
          }
          if (environmentsResult.branchPolicySubResults) {
            result.subResults.push(...environmentsResult.branchPolicySubResults);
          }
          // Mark warnings from protection rules
          if (environmentsResult.protectionRuleSubResults?.some(s => s.status === SubResultStatus.WARNING)) {
            result.hasWarnings = true;
          }
        } else {
          result.hasWarnings = true;
          result.environmentsSyncWarning = environmentsResult.error;
          core.warning(`  ⚠️  ${environmentsResult.error}`);
          result.subResults.push(
            createSubResult('environments-sync', SubResultStatus.WARNING, 'Environments sync produced a warning')
          );
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
          if (copilotResult.copilotInstructions && copilotResult.copilotInstructions !== 'unchanged') {
            result.subResults.push(
              createSubResult('copilot-instructions-sync', SubResultStatus.CHANGED, copilotResult.message, {
                syncStatus: copilotResult.copilotInstructions,
                prNumber: copilotResult.prNumber,
                prUrl: copilotResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.copilotInstructionsSyncWarning = copilotResult.error;
          core.warning(`  ⚠️  ${copilotResult.error}`);
          result.subResults.push(
            createSubResult(
              'copilot-instructions-sync',
              SubResultStatus.WARNING,
              'Copilot instructions sync produced a warning'
            )
          );
        }
      }

      // Sync CODEOWNERS if specified
      if (repoCodeowners) {
        core.info(`  👥 Checking CODEOWNERS...`);
        if (repoCodeownersVars) {
          const varNames = Object.keys(repoCodeownersVars).join(', ');
          core.info(`  📝 Using template variables: ${varNames}`);
        }
        const codeownersResult = await syncCodeowners(
          octokit,
          repo,
          repoCodeowners,
          repoCodeownersTargetPath,
          codeownersPrTitle,
          dryRun,
          repoCodeownersVars
        );

        // Add codeowners result to the main result
        result.codeownersSync = codeownersResult;

        if (codeownersResult.success) {
          core.info(`  👥 ${codeownersResult.message}`);
          if (codeownersResult.prUrl) {
            core.info(`  🔗 PR URL: ${codeownersResult.prUrl}`);
          }
          if (codeownersResult.codeowners && codeownersResult.codeowners !== 'unchanged') {
            result.subResults.push(
              createSubResult('codeowners-sync', SubResultStatus.CHANGED, codeownersResult.message, {
                syncStatus: codeownersResult.codeowners,
                prNumber: codeownersResult.prNumber,
                prUrl: codeownersResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.codeownersSyncWarning = codeownersResult.error;
          core.warning(`  ⚠️  ${codeownersResult.error}`);
          result.subResults.push(
            createSubResult('codeowners-sync', SubResultStatus.WARNING, 'CODEOWNERS sync produced a warning')
          );
        }
      }

      // Sync package.json if specified
      const repoPackageJsonFile = repoConfig?.['package-json-file'] || packageJsonFile;
      const repoSyncScripts =
        repoConfig?.['package-json-sync-scripts'] !== undefined ? repoConfig['package-json-sync-scripts'] : syncScripts;
      const repoSyncEngines =
        repoConfig?.['package-json-sync-engines'] !== undefined ? repoConfig['package-json-sync-engines'] : syncEngines;

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
          if (packageJsonResult.packageJson && packageJsonResult.packageJson !== 'unchanged') {
            result.subResults.push(
              createSubResult('package-json-sync', SubResultStatus.CHANGED, packageJsonResult.message, {
                syncStatus: packageJsonResult.packageJson,
                prNumber: packageJsonResult.prNumber,
                prUrl: packageJsonResult.prUrl
              })
            );
          }
        } else {
          result.hasWarnings = true;
          result.packageJsonSyncWarning = packageJsonResult.error;
          core.warning(`  ⚠️  ${packageJsonResult.error}`);
          result.subResults.push(
            createSubResult('package-json-sync', SubResultStatus.WARNING, 'Package.json sync produced a warning')
          );
        }
      }

      // Derive hasWarnings from subResults
      // TODO(v3): Remove hasWarnings once consumers use subResults directly
      result.hasWarnings = result.subResults.some(s => s.status === SubResultStatus.WARNING);

      if (result.success) {
        successCount++;
        if (result.hasWarnings) {
          warningCount++;
        }
        const repoHasChanges = hasRepositoryChanges(result);
        if (repoHasChanges) {
          changedCount++;
        }
        if (dryRun) {
          if (repoHasChanges) {
            core.info(`🔍 Would update ${repo}`);
          } else {
            core.info(`✅ No changes needed in ${repo}`);
          }
        } else {
          if (repoHasChanges) {
            core.info(`✅ Successfully updated ${repo}`);
          } else {
            core.info(`✅ No changes needed in ${repo}`);
          }
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
          const enabling = result.codeScanningChange.to === 'configured';
          if (dryRun) {
            core.info(
              `  📊 Would ${enabling ? 'enable' : 'disable'} CodeQL scanning: ${result.codeScanningChange.from} → ${result.codeScanningChange.to}`
            );
          } else {
            core.info(
              `  📊 CodeQL scanning ${enabling ? 'enabled' : 'disabled'}: ${result.codeScanningChange.from} → ${result.codeScanningChange.to}`
            );
          }
        } else if (result.codeScanningUnchanged) {
          core.info(`  📊 CodeQL scanning unchanged: ${result.currentCodeScanning}`);
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

        // Log secret scanning changes
        if (result.secretScanningChange) {
          if (dryRun) {
            core.info(
              `  🔍 Would ${result.secretScanningChange.to ? 'enable' : 'disable'} secret scanning: ${result.secretScanningChange.from} → ${result.secretScanningChange.to}`
            );
          } else {
            core.info(
              `  🔍 Secret scanning ${result.secretScanningChange.to ? 'enabled' : 'disabled'}: ${result.secretScanningChange.from} → ${result.secretScanningChange.to}`
            );
          }
        } else if (result.secretScanningUnchanged) {
          core.info(`  🔍 Secret scanning unchanged: ${result.currentSecretScanning ? 'enabled' : 'disabled'}`);
        }

        if (result.secretScanningWarning) {
          core.warning(`  ⚠️ ${result.secretScanningWarning}`);
        }

        // Log secret scanning push protection changes
        if (result.secretScanningPushProtectionChange) {
          if (dryRun) {
            core.info(
              `  🛡️ Would ${result.secretScanningPushProtectionChange.to ? 'enable' : 'disable'} secret scanning push protection: ${result.secretScanningPushProtectionChange.from} → ${result.secretScanningPushProtectionChange.to}`
            );
          } else {
            core.info(
              `  🛡️ Secret scanning push protection ${result.secretScanningPushProtectionChange.to ? 'enabled' : 'disabled'}: ${result.secretScanningPushProtectionChange.from} → ${result.secretScanningPushProtectionChange.to}`
            );
          }
        } else if (result.secretScanningPushProtectionUnchanged) {
          core.info(
            `  🛡️ Secret scanning push protection unchanged: ${result.currentSecretScanningPushProtection ? 'enabled' : 'disabled'}`
          );
        }

        if (result.secretScanningPushProtectionWarning) {
          core.warning(`  ⚠️ ${result.secretScanningPushProtectionWarning}`);
        }

        // Log Dependabot alerts changes
        if (result.dependabotAlertsChange) {
          if (dryRun) {
            core.info(
              `  🤖 Would ${result.dependabotAlertsChange.to ? 'enable' : 'disable'} Dependabot alerts: ${result.dependabotAlertsChange.from} → ${result.dependabotAlertsChange.to}`
            );
          } else {
            core.info(
              `  🤖 Dependabot alerts ${result.dependabotAlertsChange.to ? 'enabled' : 'disabled'}: ${result.dependabotAlertsChange.from} → ${result.dependabotAlertsChange.to}`
            );
          }
        } else if (result.dependabotAlertsUnchanged) {
          core.info(`  🤖 Dependabot alerts unchanged: ${result.currentDependabotAlerts ? 'enabled' : 'disabled'}`);
        }

        if (result.dependabotAlertsWarning) {
          core.warning(`  ⚠️ ${result.dependabotAlertsWarning}`);
        }

        // Log Dependabot security updates changes
        if (result.dependabotSecurityUpdatesChange) {
          if (dryRun) {
            core.info(
              `  🔄 Would ${result.dependabotSecurityUpdatesChange.to ? 'enable' : 'disable'} Dependabot security updates: ${result.dependabotSecurityUpdatesChange.from} → ${result.dependabotSecurityUpdatesChange.to}`
            );
          } else {
            core.info(
              `  🔄 Dependabot security updates ${result.dependabotSecurityUpdatesChange.to ? 'enabled' : 'disabled'}: ${result.dependabotSecurityUpdatesChange.from} → ${result.dependabotSecurityUpdatesChange.to}`
            );
          }
        } else if (result.dependabotSecurityUpdatesUnchanged) {
          core.info(
            `  🔄 Dependabot security updates unchanged: ${result.currentDependabotSecurityUpdates ? 'enabled' : 'disabled'}`
          );
        }

        if (result.dependabotSecurityUpdatesWarning) {
          core.warning(`  ⚠️ ${result.dependabotSecurityUpdatesWarning}`);
        }
      } else {
        failureCount++;
        core.warning(`❌ Failed to update ${repo}: ${result.error}`);
      }
    }

    // Set outputs
    const unchangedCount = successCount - changedCount;
    core.setOutput('updated-repositories', successCount.toString());
    core.setOutput('changed-repositories', changedCount.toString());
    core.setOutput('unchanged-repositories', unchangedCount.toString());
    core.setOutput('failed-repositories', failureCount.toString());
    core.setOutput('warning-repositories', warningCount.toString());
    core.setOutput('results', JSON.stringify(results));

    // Create summary
    if (writeJobSummary) {
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

          const hasChanges = hasRepositoryChanges(r);
          let status;
          let details;

          if (r.archived) {
            status = '⏭️ Skipped';
          } else if (r.hasWarnings) {
            status = '⚠️ Warning';
          } else if (hasChanges) {
            status = '✅ Changed';
          } else {
            status = '➖ No changes';
          }

          if (r.archived) {
            details = 'Repository is archived';
          } else if (r.subResults && r.subResults.length > 0) {
            const messages = r.subResults
              .filter(s => s.status === SubResultStatus.WARNING || s.status === SubResultStatus.CHANGED)
              .map(s => formatSubResultSummary(s, dryRun));
            details = messages.length > 0 ? messages.join('; ') : 'No changes needed';
          } else {
            details = 'No changes needed';
          }

          return [r.repository, status, details];
        })
      ];

      try {
        const heading = dryRun ? `${jobSummaryHeadingBase} (DRY-RUN)` : jobSummaryHeadingBase;

        let summaryBuilder = core.summary.addHeading(heading);

        if (dryRun) {
          summaryBuilder = summaryBuilder.addRaw('\n**🔍 DRY-RUN MODE:** No changes were applied\n');
        }

        summaryBuilder
          .addRaw(`\n**Total Repositories:** ${repoList.length}`)
          .addRaw(`\n**Changed:** ${changedCount}`)
          .addRaw(`\n**Unchanged:** ${unchangedCount}`)
          .addRaw(`\n**Warnings:** ${warningCount}`)
          .addRaw(`\n**Failed:** ${failureCount}\n\n`)
          .addTable(summaryTable);
        await summaryBuilder.write();
      } catch {
        // Fallback for local development
        const heading = dryRun ? `🔍 DRY-RUN: ${jobSummaryHeadingBase}` : `📊 ${jobSummaryHeadingBase}`;
        core.info(heading);
        core.info(`Total Repositories: ${repoList.length}`);
        core.info(`Changed: ${changedCount}`);
        core.info(`Unchanged: ${unchangedCount}`);
        core.info(`Warnings: ${warningCount}`);
        core.info(`Failed: ${failureCount}`);
        for (const result of results) {
          if (!result.success) {
            core.info(`  ${result.repository}: ❌ ${result.error}`);
          } else if (result.hasWarnings) {
            core.info(`  ${result.repository}: ⚠️ Warning`);
          } else {
            const hasChanges = hasRepositoryChanges(result);
            const details = dryRun
              ? hasChanges
                ? 'Would update'
                : 'No changes needed'
              : hasChanges
                ? 'Updated'
                : 'No changes needed';
            core.info(`  ${result.repository}: ${hasChanges ? '✅' : '➖'} ${details}`);
          }
        }
      }
    } else {
      core.info('Job summary writing is disabled (write-job-summary: false)');
    }

    if (failureCount > 0) {
      const repositoryLabel = failureCount === 1 ? 'repository' : 'repositories';
      core.setFailed(`${failureCount} ${repositoryLabel} failed to update`);
    } else {
      core.info('✅ Action completed successfully!');
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
