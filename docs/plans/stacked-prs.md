# Stacked PRs for project threads

Status: proposal, 26 Oct 2026, awaiting Rohit's approval. Canvas: not applicable (process and docs only, no app
change); skipping it needs Rohit's OK.

## Short answer

Yes, but only part of it works from a thread today, and we should use it rarely.

- **Threads can't create a native stack by themselves.** Threads talk to GitHub through the GitHub MCP tools, which
  have no stack tools, and `gh` in the cloud container has no valid token. A thread can open a PR whose base is
  another open PR's branch (an old-style dependent PR). Turning that into a native stack takes one of: `gh stack link`
  on your Mac (Remote Control), the stack option on github.com, or the Stacks REST API (no thread can reach it).
- **Threads must never merge a stack.** The MCP merge tool calls the old synchronous merge endpoint, which GitHub says
  can't merge a stack. You already merge by hand, so this changes nothing; it just becomes a written rule.
- **Auto-merge is the real catch.** The merge docs say "Auto-merge is not supported for stacked pull requests"; the
  GA changelog (6 Oct) says stack auto-merge is "rolling out over the next few weeks". Assume it's off for stacked
  PRs on this repo until the pilot shows otherwise, so you merge stacks by hand from the top PR's merge box.
- **Most of our threads don't need it.** Every recent PR here was branched from master and landed fine that way. Stacking pays when a
  thread genuinely builds on unmerged work (e.g. a migration PR plus the UI that uses it), not as a default.

## How the feature works (what matters for us)

Sources: [About stacked PRs](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests),
[Merging stacked PRs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests),
[APIs and webhooks](https://docs.github.com/en/pull-requests/reference/stacked-pull-requests-apis-and-webhooks),
[gh-stack](https://github.com/github/gh-stack), [GA changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available).

- A stack is a linear chain of PRs in one repo. The bottom PR targets the trunk (`master`); each PR above targets the
  branch below it. Each PR shows only its own layer's diff and is reviewed on its own.
- Branch protection, required checks and `pull_request` workflows are evaluated **as if every PR targets the trunk**.
  So `Tests: PR + master` and the required `CI passed` check run on every layer with no workflow change.
- Merging goes bottom up. You can merge the bottom PR alone, or a contiguous run from the bottom up to any PR, as one
  all-or-nothing operation. A middle PR can't merge without the ones below it.
- Merge commit, squash and rebase all work. **This repo uses merge commits** (every PR lands as "Merge pull request
  #N"), not squash; a stack of N PRs lands as N merges, so `semantic-release` and the changelog see the same commits
  as today.
- After a lower PR merges, GitHub **rebases the next PR onto master and retargets it**. That rewrites that PR's branch
  on the server, so the owning thread must fetch and reset to it before pushing again, or it will push stale history.
- The stack must have **linear history** to merge. When master moves or a lower branch gets a fix, the stack is
  restored with `gh stack rebase` + `gh stack push`, or the "Rebase stack" button in the merge box. Merging master into
  a stacked branch (what threads do today for conflicts) breaks this; stacked branches must be rebased instead.
- Webhooks and Actions get a `stack` object on the PR (`github.event.pull_request.stack`), and a new `stacked` action.
- Not supported: fork PRs, tree-shaped stacks, GitHub Desktop, legacy merge endpoints, merging once a stack is fully
  merged (a fully merged stack is closed; new work starts a new stack).

## How it fits our setup

| Piece                         | Effect                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI passed` required check    | Runs on every layer, judged against master's rules. A layer can't merge unless every layer below it is green and approved.                                                                                                                               |
| Path filters (`What changed`) | Filters on the PR's own files, so an upper docs-only layer skips the heavy jobs while the lower code layer runs them. That's correct: each layer's code is tested in its own PR, and master's push run tests the combined result. To check in the pilot. |
| CI cost                       | Each layer runs its own CI. Two code layers = two full runs. Another reason not to split small changes.                                                                                                                                                  |
| Auto-merge (on for the repo)  | Not available for stacked PRs yet (see above). Unstacked PRs keep auto-merge as today.                                                                                                                                                                   |
| Dependabot                    | Untouched. Its PRs target master and never join a stack. If one merges, stacks above master just need a rebase.                                                                                                                                          |
| Merging                       | Rohit merges in the GitHub UI. Threads never call the MCP merge tool on a stacked PR.                                                                                                                                                                    |
| Attribution and assignee      | Each layer is a normal PR: same two-line attribution block, assignee and reviewer `shimorojune` on every layer.                                                                                                                                          |
| Thread branches               | Each thread owns one designated branch (`claude/project-thread-xxxx`) and may only push there. That makes the natural unit **one thread = one layer**.                                                                                                   |
| Staging deploy                | Unchanged: only pushes to master deploy.                                                                                                                                                                                                                 |

## Guideline: when a thread stacks

Branch from master (the default) unless **all** of these hold:

1. The work needs code from another **open, unmerged** PR to build, run or test, not just to avoid a conflict.
2. That PR is close to mergeable (proposal approved, CI green or nearly).
3. Waiting for it to merge would block the thread for more than a few hours.

Conflicts alone are not a reason to stack: branch from master and resolve when the other PR lands.

When a thread does stack:

- It branches from the lower PR's branch, opens its PR via MCP with `base` = that branch, and says in the PR body and
  its thread reply which PR it sits on. The lower thread is told with `message_thread` (it now has a dependant and
  must not force-push without telling it).
- It asks Rohit to link the two into a native stack (one click on github.com, or `gh stack link <lower> <upper>` on
  the Mac). Until linked it works as a plain dependent PR, which is fine.
- Conflicts and master moving: rebase, never merge master in. If a thread can't run `gh stack rebase` itself, it
  rebases its own branch onto the updated lower branch and pushes with `--force-with-lease` to its own branch only.
- After the lower PR merges, the upper thread fetches its branch (GitHub has rebased it) before touching it.
- Stacking within one thread (several layers from one thread) needs extra branches, so it needs Rohit's OK per case.
  Default is one PR per thread.

## Changes, once approved

1. **Project instructions** (Rohit pastes; threads can't edit them). Proposed text:
   > PRs: branch from master by default. Stack a PR on another open PR only when it needs that PR's unmerged code and
   > waiting would block it, following docs/plans/stacked-prs.md. Never merge a stacked PR from a thread; Rohit merges
   > stacks on GitHub.
2. **AGENTS.md**: a short "Stacked PRs" section pointing here, with the rebase-not-merge and never-merge rules.
3. **Project memory**: one note recording the guideline and the auto-merge/merge-endpoint limits.
4. **Rohit's Mac** (one time, optional): `gh extension install github/gh-stack` so Remote Control sessions can run
   `gh stack link/rebase/view`. Needs gh 2.0+ and Git 2.36+.

## Test scenarios (pilot, docs-only so it costs nothing)

Run once on shimorojune/tudu after approval, with two throwaway docs-only branches:

| ID    | Scenario                                                                         | Expected                                                                            |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SP-01 | Thread opens PR A (base master) and PR B (base A's branch) through the MCP tools | Both open; B shows only its own diff                                                |
| SP-02 | Link A and B into a stack (github.com or `gh stack link`)                        | Stack of 2 shown on both PRs; MCP `pull_request_read` still reads both              |
| SP-03 | CI on both layers                                                                | `Tests: PR + master` runs on each; `CI passed` reported on each; heavy jobs skipped |
| SP-04 | Try auto-merge on B                                                              | Record whether GitHub offers it; update this doc                                    |
| SP-05 | Push a fix to A                                                                  | Stack shows non-linear; "Rebase stack" (or `gh stack rebase`) restores it           |
| SP-06 | Merge A alone from the UI                                                        | A lands as a merge commit; B is rebased and retargeted to master; CI reruns on B    |
| SP-07 | Thread fetches B after SP-06 and pushes a commit                                 | Push succeeds only after the thread resets to the rebased branch (no stale history) |
| SP-08 | Merge B                                                                          | Stack closes; master has both changes; staging deploy runs once per merge           |

Results go into this file. If SP-02 or SP-06 fails, we stay with plain dependent PRs and drop the native-stack steps.
