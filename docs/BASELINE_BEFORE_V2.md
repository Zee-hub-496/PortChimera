# Baseline before PortChimera 2.0

Written 2026-11-28 at the start of the 2.0 work. Everything below was read from Git or run in the agent sandbox on that date. Items the agent could not run are marked NOT TESTED.

## Saved references

| Item                     | Value                                                                         |
| ------------------------ | ----------------------------------------------------------------------------- |
| Original commit (`main`) | `b38f37cc48ea91874494ace0098c250a85178664` (merge of PR #50)                  |
| Backup commit            | `b38f37cc48ea91874494ace0098c250a85178664` (same commit, see "Checkpoint")    |
| Backup branch            | `backup/portchimera-pre-v2` (pushed to `origin`)                              |
| Backup tag               | `pre-v2-2026-11-28` (annotated, tag object `7a27007`, peels to `b38f37c`)     |
| Development branch       | `feat/portchimera-2.0`, created from the backup commit                        |
| Older release tag        | `v0.1.0-rc1` (commit `7daa36e`), untouched                                    |
| `main` after this work   | unchanged at `b38f37c`; nothing in 2.0 is merged until the release tests pass |

Remote verification (`git ls-remote origin`): `refs/heads/backup/portchimera-pre-v2` and `refs/tags/pre-v2-2026-11-28^{}` both resolve to `b38f37cc48ea91874494ace0098c250a85178664`. Neither name existed before.

## Checkpoint

`git status --short --branch` printed `## main...origin/main` and nothing else: no modified, staged or untracked files, no stashes. There was no uncommitted work to preserve, so no checkpoint commit was made. The backup points directly at the last commit on `main`.

## Baseline tests

Run in the agent sandbox, which has no npm registry access (network mode `INTEGRATIONS_ONLY`), so `npm ci` could not install dependencies.

| Check                                | Result                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret scan (`npm run scan:secrets`) | PASS, 315 files                                                                                                                                                                   |
| Prettier check                       | PASS                                                                                                                                                                              |
| `packages/core` tests                | PASS, 221 of 221                                                                                                                                                                  |
| `scripts` tests                      | PASS, 23 of 23                                                                                                                                                                    |
| `apps/web` tests                     | PASS, 230 of 230                                                                                                                                                                  |
| `apps/api` tests                     | 162 of 175 pass. The 13 failures are all `ERR_MODULE_NOT_FOUND` for `express`, `zod`, `@portchimera/core` (no `node_modules`). They are not code failures. Counted as NOT TESTED. |
| ESLint                               | NOT TESTED (needs installed dependencies)                                                                                                                                         |
| Web production build                 | NOT TESTED (needs installed dependencies)                                                                                                                                         |
| Playwright / browser                 | NOT TESTED                                                                                                                                                                        |

CI on `main` (secret scan, lint, format, tests, web build) was reported green by the owner and is the reference for the full run. Re-run on the owner's machine with `npm ci && npm test && npm run lint` to get a full local baseline.

## Baseline deployment status (reported by the owner on 2026-11-28, not checked by the agent)

- Web: https://port-chimera.vercel.app on Vercel.
- API: https://portchimera.onrender.com on Render free tier, health at `/api/health`.
- Supabase migrations `0001` to `0004` applied. Database security checks 0 to 9 PASS. Deployed smoke test 5 of 5 PASS.
- The agent cannot reach these services (see `docs/AUDIT_2026-11-28.md`), so none of this was re-verified here.

## How to restore the original application

Nothing below deletes anything. Pick one.

1. Look at the old version without changing anything: `git switch --detach pre-v2-2026-11-28`.
2. Work from the old version on a new branch: `git switch -c restore/pre-v2 pre-v2-2026-11-28`.
3. Fetch the backup on another machine: `git fetch origin backup/portchimera-pre-v2 tag pre-v2-2026-11-28`.
4. Deploy the old version: `main` is still at `b38f37c`. If 2.0 has been merged and must be undone, create a revert pull request on GitHub (`git revert -m 1 <merge commit>`), or open a pull request from `backup/portchimera-pre-v2` into `main`. Do not force-push `main`.
5. Database: 2.0 is planned with no new migration. If a migration is added, its rollback is written in the migration file and listed in `docs/V2_PLAN.md`.
