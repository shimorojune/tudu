# Release: push the release commit with a deploy key, so the master ruleset doesn't block it

Status: approved by Rohit 26 Oct 2026; implemented. Canvas: not applicable (release tooling only, no visible change);
skipping it approved by Rohit 26 Oct 2026.

## Why

Since PR #25, `CI passed` is the one required check, and Rohit is adding a branch ruleset on `master` that requires
it (26 Oct 2026). GitHub says what that means for pushes: "commits must first be pushed to another ref where the
checks pass." Every real release breaks on it:

- `@semantic-release/git` commits `chore(release): X.Y.Z` (CHANGELOG.md, package.json) and pushes it **straight to
  master** with the workflow's `GITHUB_TOKEN`.
- That commit has never run CI, so the ruleset rejects the push. The `version` job fails, and nothing after it runs:
  no Mac build, no deploy, no release.
- The workflow token can't be put on the bypass list: the ruleset's bypass picker has no "GitHub Actions" entry
  (Rohit checked, 26 Oct). **Deploy keys** can be added.

Tags aren't affected: the ruleset targets the `master` branch only.

## The change

1. **Rohit, once, by hand:**
   - Make a key pair on his Mac with no passphrase: `ssh-keygen -t ed25519 -C "tudu release" -N "" -f tudu-release`.
   - Repo › Settings › Deploy keys › Add: title `Release push`, paste `tudu-release.pub`, tick **Allow write access**.
   - Repo › Settings › Secrets and variables › Actions › New secret `RELEASE_DEPLOY_KEY` = the contents of
     `tudu-release` (the private half). Then delete both files from the Mac.
   - In the `master` ruleset's Bypass list: **Deploy keys** (Others tab), plus **Repository admin** (Roles) for an
     emergency push by hand.
2. **`release.yml`, job `version`, checkout step:** add `ssh-key: ${{ secrets.RELEASE_DEPLOY_KEY }}` and
   `persist-credentials: true` (the default, written down so nobody removes it). The checkout then sets `origin` to
   `git@github.com:shimorojune/tudu.git` and points git at the key.
   - semantic-release takes its repository URL from `origin` (package.json has no `repository` field). With an SSH
     URL it pushes the release commit and the tag over SSH, with the deploy key, and uses `GITHUB_TOKEN` only for the
     GitHub API (the draft release). Nothing else in the workflow pushes to git.
3. **`docs/release.md`:** a new step under "Once, before the first release" for the deploy key, the secret and the
   bypass. A troubleshooting line for "push declined due to repository rule violations".

No other job changes. Rehearsals (PRs that touch the release path, or `rehearsal: true`) check out over SSH too, and
their dry run pushes nothing.

## Risks

- **Who can use the key.** Like the existing Dokploy secrets, `RELEASE_DEPLOY_KEY` is readable by any workflow run
  on a branch of this repo, including a PR that edits a workflow. Anyone who can push a branch here could push to
  master past the ruleset with it. Today only Rohit (and Claude threads under his account) can push branches, so the
  risk doesn't grow. Fork PRs never get secrets. If that changes, the hardening is a `release` environment limited
  to master that holds the secret. I left it out because it would break PR rehearsals, which run from PR branches.
- **A bad key.** If the secret is missing or wrong, the checkout fails at the very start of the `version` job, before
  anything is tagged or pushed. Nothing is left half done.

## Test scenarios (verification)

CI config only: no app code or test changes.

- **V1 rehearsal on this PR** (the PR touches `release.yml`, so the release workflow rehearses on it): the checkout
  over SSH works, and the semantic-release dry run reports the next version. Its push-access check (`git push
--dry-run`) passes over SSH.
- **V2 ruleset in force:** after merge, with the ruleset active, a direct `git push` to master **without** the key
  is still refused. Rohit can check from his Mac with a throwaway commit, or I can show the rejection from a CI log.
  This proves the ruleset itself works.
- **V3 the next real release:** the `version` job pushes `chore(release): X.Y.Z` and tag `tudu-X.Y.Z` to master,
  and the rest of the release runs as before. This is the real proof. It happens on the next release Rohit starts.
  If it fails there, the fallback is to rerun the release after a temporary bypass for Repository admin. That gets
  the release out, and we fix forward.
