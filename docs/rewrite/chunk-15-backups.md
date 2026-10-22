# Chunk 15 · Backups

Status: proposed 22 Oct 2026; parked the same day (you asked to leave backups for now). Branch `infra/15-backups` when
it is picked up. No app code; it can be built beside any chunk.

No board draws this; it is the later.md line "Database backups from Dokploy to object storage once production has
data worth keeping" (20 Oct 2026), brought forward so the first release starts with backups in place. What is
backed up: the Postgres databases (`tudu` on production, `tudu_staging` on staging) and the attachment files in
object storage (RustFS, the `tudu` and `tudu-staging` buckets). Nothing else on the host is Tudu's: images are
rebuilt from git, settings are in Dokploy's own database (Dokploy backs that up itself when told to).

## Scope

- **Where the copies go.** A new bucket, `tudu-backups-958123553953`, in the dev AWS account (the one that holds
  the ezdev.net zone), us-west-2, private, encrypted at rest, with a lifecycle rule that deletes anything older
  than 90 days. Off the host, so a lost host or a full disk loses nothing. An IAM user, `tudu-backups`, that can
  list, put and delete in that bucket and nothing else.
- **Dokploy does the copying.** Dokploy's own backups, pointed at that bucket as a Destination:
  - Production Postgres: every day at 03:10 UTC, `pg_dump` of `tudu`, the newest 30 kept. Prefix
    `production/postgres/`.
  - Staging Postgres: every day at 03:40 UTC, the newest 7 kept. Prefix `staging/postgres/`.
  - Production attachments: a volume backup of the RustFS data volume every day at 03:20 UTC, the newest 14 kept,
    the service left running. Prefix `production/files/`.
  - Staging attachments: weekly on Sunday 03:50 UTC, the newest 2 kept. Prefix `staging/files/`.
- **The setup lives in the repo.** `scripts/dokploy-backups.mjs` creates or updates the destination and the four
  schedules from one table in the script, idempotently, as `dokploy-deploy.mjs` already keeps the compose files in
  step. It reads the bucket keys from the environment and never prints them. `infra/backups/README.md` says what
  is backed up, where, how long, and the two restore paths.
- **A restore you can do.** `scripts/restore-db.sh <dump> <database-url>` restores a dump into a fresh database
  (pgvector present, chunk 13's extension restores with it); the README walks the switch of `DATABASE_URL` and the
  redeploy. Files: the README shows the untar into the RustFS volume. Both are rehearsed once on staging as part of
  this chunk and the result noted in the PR.
- **Someone notices when it stops.** A GitHub workflow, `Backup check`, every day at 06:00 UTC on a GitHub runner:
  it asks Dokploy for each schedule's files and fails when the newest production dump is older than 26 hours, the
  production files older than 26 hours, or a staging copy older than its own interval plus a day. A failed run
  emails you as GitHub does; nothing in the app changes.
- **Everywhere else.** Nothing in the app, the API or the schema changes.

Out of scope: point-in-time recovery (WAL shipping; a day's loss is the accepted window for a planner); backups of
Dokploy itself (its own setting, turn it on in Dokploy's UI if you want it); a second region; restoring from the
app's UI; moving object storage off RustFS (still in [later.md](later.md)).

## Choices

1. **Dokploy's own backups, not a cron container.** Dokploy already runs `pg_dump` and volume tars to an S3
   destination on a schedule, keeps the last N, and shows the files; using it means no new container on a host
   with two vCPUs and no second place that holds the database password. The alternative is a `tudu-backup` compose
   with cron, `pg_dump` and `rclone`, which is more ours to control and more ours to break.
2. **An AWS bucket off the host, not the host's own object storage.** A copy on the same disk as the original is
   not a backup. The dev AWS account is where Tudu already lives (DNS), the bucket costs cents a month at Tudu's
   size, and the IAM user can touch nothing else. The alternative is an external bucket at Backblaze or Cloudflare,
   one more account to keep.
3. **Daily, 30 production dumps, 90 days in the bucket.** A planner's day is the loss you would accept; thirty days
   of dumps covers "I deleted that space last week"; the lifecycle rule bounds the bill whatever Dokploy keeps. The
   alternative is hourly dumps, which multiply files for a planner that changes little in an hour.
4. **Files are copied with the service running.** Attachments are written once and never changed, so a copy taken
   mid-upload loses at most that upload, which the next day's copy has. The alternative stops RustFS for the copy
   and makes the app's files unreachable for a minute each night.
5. **The check is a workflow, not a page in the app.** The API has no way to see the bucket, and a check that
   lives next to what it checks fails with it. A GitHub runner asks Dokploy from outside and GitHub emails on
   failure, nothing new to host. The alternative shows the last backup's age in Settings › Space for admins, which
   needs the API to hold the bucket keys.
6. **Rehearsed once, then quarterly.** A backup that was never restored is a hope. The restore of a staging dump
   and a file copy into a scratch database and folder is part of this chunk's done; a quarterly repeat goes on
   later.md as a reminder, not a workflow.

## Test plan

Unit (`scripts`):

| ID      | Component | Case                                                                                                                                                    |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C15-U01 | check     | The age rule: a listing newer than the window passes, older fails naming the schedule, an empty listing fails, each schedule's own window               |
| C15-U02 | setup     | The plan: from the table, what would be created, updated or left alone against a fake Dokploy answer; the keys never appear in its output               |
| C15-U03 | restore   | The script refuses a database that already has tables, names the dump and the target, and runs `pg_restore` with the agreed flags (a fake `pg_restore`) |

Manual, recorded in the PR with the Dokploy and S3 listings (no runner can see the bucket):

| ID      | Case                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| C15-M01 | The bucket, its lifecycle rule and the IAM user exist; the user can list and put in the bucket and nothing else                   |
| C15-M02 | `dokploy-backups.mjs` creates the destination and four schedules; a second run changes nothing; Dokploy's connection test passes  |
| C15-M03 | A manual run of each schedule lands a file under its prefix in the bucket                                                         |
| C15-M04 | The staging dump restores into a scratch database with `restore-db.sh`; the migrations report nothing to apply; a task reads back |
| C15-M05 | The staging file copy untars and an attachment opens from the restored folder                                                     |
| C15-M06 | `Backup check` passes on its first scheduled run; run by hand against a listing with no files it fails and the email arrives      |

End-to-end: none; the app does not change, and the smoke group runs as before.

## Done when

- The six manual cases are done and recorded in the PR.
- Thirty days on, production has thirty dumps and the check has not failed, or it failed and told you.

Open items for you (the build needs them): the IAM user's access key and secret have to reach Dokploy's
destination. I can create the bucket, the lifecycle rule and the IAM user through the dev AWS profile with your
go-ahead, and the script can write the destination, but writing the secret into Dokploy is a secret-store write
that this session will stop at, as it did for the staging S3 keys; you run `scripts/dokploy-backups.mjs` once with
the keys in your environment, or approve the write when it asks.
