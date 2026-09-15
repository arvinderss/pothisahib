#!/bin/sh
# Restore a backup archive produced by backup.sh into an EMPTY database and an object directory.
# Usage: DATABASE_URL=postgres://kosh_owner:...@host/gurbani_kosh ./restore.sh kosh-backup-<stamp>.tgz [objects-dir]
# Afterwards run `pnpm kosh migrate status` and the test-suite's round-trip check (docs/backup-restore.md).
# STATUS: not executed on the Milestone-1 development machine; rehearse before relying on it.
set -eu
ARCHIVE="${1:?backup archive}"
OBJECTS="${2:-./.data/objects}"
WORK="$(mktemp -d)"
tar -C "$WORK" -xzf "$ARCHIVE"
( cd "$WORK" && sha256sum -c SHA256SUMS --ignore-missing ) || { echo "checksum mismatch"; exit 1; }
pg_restore --no-owner --dbname "${DATABASE_URL:?DATABASE_URL}" "$WORK/gurbani_kosh.dump"
if [ -f "$WORK/objects.tgz" ]; then mkdir -p "$OBJECTS"; tar -C "$OBJECTS" -xzf "$WORK/objects.tgz"; fi
rm -rf "$WORK"
echo "restored $ARCHIVE"
