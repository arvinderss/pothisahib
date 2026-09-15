-- 0001 foundation: extensions, database roles, shared helper functions.
-- Roles are cluster-level; CREATE ROLE is guarded so re-running on a shared cluster is safe.
-- Passwords are NOT set here — deployment sets them via ALTER ROLE from secrets (docs/deployment.md).

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS kosh;        -- helper functions
CREATE SCHEMA IF NOT EXISTS public_api;  -- read-only views for the public API role

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_public') THEN
    CREATE ROLE kosh_public LOGIN NOINHERIT;   -- public API: SELECT on public_api views only
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_ingest') THEN
    CREATE ROLE kosh_ingest LOGIN NOINHERIT;   -- ingestion: may write source layer, never accepted layer
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kosh_app') THEN
    CREATE ROLE kosh_app LOGIN NOINHERIT;      -- account/report/admin APIs: DML, no DDL
  END IF;
END $$;

-- Generic trigger: refuse any UPDATE or DELETE. Attached to every append-only table.
CREATE OR REPLACE FUNCTION kosh.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % is not permitted (PROJECT_PRINCIPLES rules 2, 7, 15)',
    TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- Generic trigger: refuse DELETE only (for tables whose metadata may be updated but never removed).
CREATE OR REPLACE FUNCTION kosh.forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rows in % may not be deleted (PROJECT_PRINCIPLES rule 15)', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE OR REPLACE FUNCTION kosh.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
