# Backup and restore

The project must survive the disappearance of its host (SRS §83). Everything needed to rebuild
it is: the database, the object store, the migrations (in Git), and the configuration.

## What to back up

| Item                                                        | How                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Database (corpus, source layer, decisions, identity, audit) | `pg_dump --format=custom`                                                               |
| Object store (raw source artefacts; later evidence)         | tar of `KOSH_OBJECT_STORE_DIR` (content-addressed, so incremental sync tools work well) |
| Migrations and code                                         | Git (`github.com/arvinderss/pothisahib`)                                                |
| Configuration                                               | `.env` kept in a password manager, never in Git                                         |

## Scripts

- `deployment/backup/backup.sh <dest> [objects-dir]`: dump + objects + migrations + checksums into `kosh-backup-<UTC stamp>.tgz`.
- `deployment/backup/restore.sh <archive> [objects-dir]`: verify checksums, `pg_restore` into an empty database, unpack objects.

Both scripts were written but **not executed on the Milestone-1 development machine (no
PostgreSQL client tools)**. Rehearse them before relying on them, then record the date here.

## Restore rehearsal (do this periodically)

1. Start a clean stack (`docker compose up postgres` or a fresh PostgreSQL).
2. `restore.sh` the latest archive.
3. `pnpm kosh migrate status`: all applied, checksums accepted.
4. Run `pnpm --filter @pothisahib/api test` against the restored database or, simpler, `curl /api/v1/banis/<slug>/lines` and compare `sha256` fields with the previous host's output. Byte identity is the acceptance criterion.

## Offline copy

Keep at least one recent archive offline (SRS §83 "Offline"). Because the public API can export
published text and provenance, a periodic JSON export of `/api/v1/banis/*/lines` and
`/api/v1/sources` is a useful human-readable second copy (dataset export endpoints arrive in a
later phase).
