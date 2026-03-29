# Add warning-repositories output for repos with warnings

## Issue: Repository reported as `Changed` when actually an error occurred.

### Scenario: Private repo not changed

I run this action for all repos of 3 owners, each in a job.

And after an initial syncing of the repos, the summary report shows one of:

- ➖ No changes	| No changes needed
- ⏭️ Skipped	| Repository is archived

except one for which always:

- ✅ Changed	Would update ...

would be reported.

Turns out this is a private repo and all the way at the bottom of the run summary these 2 warnings are displayed:

- sync (config/owners/aicage.yml)  
  ⚠️ Could not process secret scanning: Secret scanning is not available for this repository. - https://docs.github.com/rest/repos/repos#update-a-repository
- sync (config/owners/aicage.yml)  
  ⚠️ Could not process CodeQL: Advanced Security must be enabled for this repository to use code scanning. - https://docs.github.com/rest/code-scanning/code-scanning#update-a-code-scanning-default-setup-configuration

In short: The update failed because necessary features are not available for private repos on a free account.

### Problem: Not transparent to calling workflow

My issue with this is that to me these are failures either in the process or in my config (repo should not be private or better not exist).  
But currently the workflow which calls this action has no easy way of detecting these problems during a run, the run-warnings are only visible in the run-summary.  
This means I only see them if I look at run-summaries of scheduled runs.

## Proposed solution in this PR

### Output variables: Add `warning-repositories`

Number of repositories that emitted warnings  

> Intersects with `changed-repositories`, see below

### Summary table: Display repos with warnings as:  
  
| Repository             | Status     | Details               |
|------------------------|------------|-----------------------|
| aicage/demo-repository | ⚠️ Warning | \<same as before PR\> |

### Reasoning

With this change the calling workflow can decide how to treat warnings while retaining the split into:

- failure (example: repo does not exist) and
- warning (some part of settings update had a problem)

## Before vs. After

`aicage/demo-repository` is the private repo with warnings.

### Before

https://github.com/Wuodan/sync-github-repo-settings/actions/runs/23717404975

![before](dist/before.png)

### After

https://github.com/Wuodan/sync-github-repo-settings/actions/runs/23717215024/attempts/1#summary-69086179308

![after](dist/after.png)