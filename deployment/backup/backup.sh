#!/bin/sh
# Full backup: database dump + object store + schema/migrations snapshot, into one dated archive.
# Usage: DATABASE_URL=postgres://kosh_owner:...@host/gurbani_kosh ./backup.sh /path/to/backups [objects-dir]
# Requires pg_dump (PostgreSQL client) and tar. See docs/backup-restore.md.
# STATUS: not executed on the Milestone-1 development machine (no PostgreSQL client); rehearse before relying on it.
set -eu
DEST="${1:?destination directory}"
OBJECTS="${2:-./.data/objects}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
mkdir -p "$DEST"

pg_dump --format=custom --no-owner --file "$WORK/gurbani_kosh.dump" "${DATABASE_URL:?DATABASE_URL}"
if [ -d "$OBJECTS" ]; then tar -C "$OBJECTS" -czf "$WORK/objects.tgz" .; fi
cp -r "$(dirname "$0")/../../corpus/migrations" "$WORK/migrations"
sha256sum "$WORK"/* 2>/dev/null > "$WORK/SHA256SUMS" || true

tar -C "$WORK" -czf "$DEST/kosh-backup-$STAMP.tgz" .
rm -rf "$WORK"
echo "$DEST/kosh-backup-$STAMP.tgz"
