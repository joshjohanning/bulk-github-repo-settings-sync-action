# Add `warning-repositories` output

This adds a `warning-repositories` output and marks warning-only repos as `⚠️ Warning` in the summary.

Why:

- today a repo can still be counted as updated/changed even when part of the requested work emitted warnings
- those warnings are visible in the run summary, but not easy for a calling workflow to act on

Example:

- a private repo on a free account reports warnings for CodeQL / secret scanning availability
- the caller currently just sees a successful run with `changed-repositories > 0`

With this change a caller can decide whether warning-only repos should be ignored, reported, or treated as a failure.

Before:

- https://github.com/Wuodan/sync-github-repo-settings/actions/runs/23717404975

![before](dist/before.png)

After:

- https://github.com/Wuodan/sync-github-repo-settings/actions/runs/23717215024/attempts/1#summary-69086179308

![after](dist/after.png)
