DROP FUNCTION IF EXISTS kosh.set_updated_at();
DROP FUNCTION IF EXISTS kosh.forbid_delete();
DROP FUNCTION IF EXISTS kosh.forbid_mutation();
DROP SCHEMA IF EXISTS public_api CASCADE;
DROP SCHEMA IF EXISTS kosh CASCADE;
-- Roles are intentionally NOT dropped: they may be referenced by other databases on the cluster
-- and dropping them would revoke deployment credentials. Remove manually if truly unwanted.
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS citext;
