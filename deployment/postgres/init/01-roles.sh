#!/bin/sh
# Runs once when the PostgreSQL data directory is first initialised (docker-entrypoint-initdb.d).
# Creates the three service login roles with passwords from the environment. Migration 0001
# creates the same roles IF NOT EXISTS (without passwords), so both orders are safe.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_public') THEN CREATE ROLE kosh_public LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_app')    THEN CREATE ROLE kosh_app    LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_ingest') THEN CREATE ROLE kosh_ingest LOGIN NOINHERIT; END IF;
END \$\$;
ALTER ROLE kosh_public PASSWORD '${KOSH_PUBLIC_PASSWORD}';
ALTER ROLE kosh_app    PASSWORD '${KOSH_APP_PASSWORD}';
ALTER ROLE kosh_ingest PASSWORD '${KOSH_INGEST_PASSWORD}';
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO kosh_public, kosh_app, kosh_ingest;
SQL
