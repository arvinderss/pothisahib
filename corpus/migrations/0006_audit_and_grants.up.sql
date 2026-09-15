-- 0006 audit log, public read-only views, and per-role grants.
-- The public API role can only SELECT from public_api.*; ingestion can never touch accepted text.

CREATE TYPE actor_type AS ENUM ('USER','ANON','SYSTEM');

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  actor_type   actor_type  NOT NULL,
  actor_id     bigint,                       -- users.id or anon_identities.id depending on actor_type
  action       text        NOT NULL,
  object_type  text        NOT NULL,
  object_id    bigint,
  before       jsonb,
  after        jsonb,
  reason       text,
  decision_id  bigint REFERENCES decisions(id),
  CONSTRAINT audit_actor_consistency CHECK ((actor_type = 'SYSTEM') = (actor_id IS NULL))
);
CREATE INDEX audit_log_object_idx ON audit_log (object_type, object_id, ts);
CREATE INDEX audit_log_actor_idx  ON audit_log (actor_type, actor_id, ts);
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();
COMMENT ON TABLE audit_log IS 'Append-only. Contains usernames/anon labels and object ids only — never IP, device or location.';

-- Security events for abuse control. ip_bucket is an HMAC with a daily-rotating, never-persisted key.
-- Rows expire; a scheduled job deletes rows older than the documented retention (docs/privacy.md).
CREATE TABLE security_events (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  kind        text        NOT NULL,       -- LOGIN_FAILED, LOCKOUT, RATE_LIMITED, RECOVERY_ATTEMPT, …
  user_id     bigint REFERENCES users(id),
  ip_bucket   bytea,                      -- HMAC-SHA256(daily_key, ip); the key is never stored
  detail      jsonb,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days'
);
CREATE INDEX security_events_expiry_idx ON security_events (expires_at);
CREATE INDEX security_events_bucket_idx ON security_events (ip_bucket, ts);

-- Automatic audit of the two events that matter most: decisions and role grants.
CREATE OR REPLACE FUNCTION kosh.audit_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id, after, reason, decision_id)
  VALUES ('USER', NEW.approver_2, 'DECISION_' || NEW.kind::text, 'bani', NEW.bani_id,
          jsonb_build_object('approver_1', NEW.approver_1, 'approver_2', NEW.approver_2, 'snapshot', NEW.source_snapshot_id),
          NEW.rationale, NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER decisions_audit AFTER INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION kosh.audit_decision();

CREATE OR REPLACE FUNCTION kosh.audit_role_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id, after, reason)
    VALUES ((CASE WHEN NEW.granted_by IS NULL THEN 'SYSTEM' ELSE 'USER' END)::actor_type, NEW.granted_by, 'ROLE_GRANT', 'user', NEW.user_id,
            jsonb_build_object('role', NEW.role), NEW.reason);
  ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id, before, reason)
    VALUES ('USER', NEW.revoked_by, 'ROLE_REVOKE', 'user', NEW.user_id, jsonb_build_object('role', NEW.role), NEW.reason);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_roles_audit AFTER INSERT OR UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION kosh.audit_role_change();

-- ---------------------------------------------------------------------------------------------
-- Public read-only views. These are the ONLY relations kosh_public can read.
-- The licence gate is structural: text whose lineage root forbids redistribution never appears.
-- ---------------------------------------------------------------------------------------------
CREATE VIEW public_api.sources AS
  SELECT s.id, s.slug, s.name, s.url, s.source_type, s.publisher, s.license, s.license_url,
         s.attribution_text, s.redistribution, s.status, s.last_synced_at
  FROM sources s WHERE s.status IN ('ACTIVE','SUSPENDED','RETIRED');

CREATE VIEW public_api.source_snapshots AS
  SELECT sn.id, sn.source_id, sn.fetched_at, encode(sn.sha256, 'hex') AS sha256_hex, sn.byte_size, sn.source_version, sn.parser_version
  FROM source_snapshots sn JOIN sources s ON s.id = sn.source_id WHERE s.status <> 'PROPOSED';

CREATE VIEW public_api.banis AS
  SELECT b.id, b.slug, b.name, b.verification_state, g.slug AS granth_slug, g.name AS granth_name, b.metadata,
         v.version_no AS published_version_no, v.published_at,
         CASE WHEN v.id IS NULL THEN false
              WHEN src.redistribution IN ('ALLOWED','ATTRIBUTION_REQUIRED') THEN true
              ELSE false END AS text_available
  FROM banis b
  JOIN granths g ON g.id = b.granth_id
  LEFT JOIN accepted_versions v ON v.bani_id = b.id AND v.status = 'PUBLISHED'
  LEFT JOIN sources src ON src.id = v.basis_source_id;

CREATE VIEW public_api.lines AS
  SELECT l.id AS line_id, l.bani_id, l.section_id, l.ordinal, v.version_no,
         tb.raw_text AS text, encode(tb.sha256, 'hex') AS text_sha256_hex, tb.codepoint_count, tb.grapheme_count,
         t.layout_id, v.basis, v.basis_source_id
  FROM accepted_versions v
  JOIN accepted_line_texts t ON t.accepted_version_id = v.id
  JOIN lines l ON l.id = t.line_id
  JOIN text_blobs tb ON tb.id = t.blob_id
  JOIN sources src ON src.id = v.basis_source_id
  WHERE v.status = 'PUBLISHED' AND src.redistribution IN ('ALLOWED','ATTRIBUTION_REQUIRED');

CREATE VIEW public_api.tokens AS
  SELECT tk.layout_id, tk.ordinal, tk.cp_start, tk.cp_end
  FROM tokens tk WHERE tk.layout_id IN (SELECT layout_id FROM public_api.lines);

CREATE VIEW public_api.versions AS
  SELECT v.id, v.bani_id, v.version_no, v.status, v.basis, v.created_at, v.published_at, v.rationale,
         d.kind AS decision_kind, d.decided_at, d.rationale AS decision_rationale
  FROM accepted_versions v LEFT JOIN decisions d ON d.id = v.decision_id
  WHERE v.status IN ('PUBLISHED','SUPERSEDED');

CREATE VIEW public_api.statistics AS
  SELECT
    (SELECT count(*) FROM banis)                                              AS banis,
    (SELECT count(*) FROM banis WHERE verification_state = 'PROVISIONAL')     AS banis_provisional,
    (SELECT count(*) FROM banis WHERE verification_state IN ('REVIEWED','LOCKED')) AS banis_reviewed,
    (SELECT count(*) FROM lines)                                              AS lines,
    (SELECT count(*) FROM sources WHERE status = 'ACTIVE')                    AS active_sources,
    (SELECT count(*) FROM source_snapshots)                                   AS snapshots,
    (SELECT count(*) FROM decisions)                                          AS decisions;

-- ---------------------------------------------------------------------------------------------
-- Grants. Defence in depth: even a bug in application code cannot cross these lines.
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM kosh_public, kosh_ingest, kosh_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM kosh_public, kosh_ingest, kosh_app;

-- public API: read views only
GRANT USAGE ON SCHEMA public_api TO kosh_public;
GRANT SELECT ON ALL TABLES IN SCHEMA public_api TO kosh_public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public_api GRANT SELECT ON TABLES TO kosh_public;

-- ingestion: may write the text substrate and source layer; may read everything in public; NOTHING on the accepted layer or identity
GRANT USAGE ON SCHEMA public, kosh TO kosh_ingest;
GRANT SELECT ON text_blobs, token_layouts, tokens, sources, source_snapshots, source_documents, source_lines, source_normalizations,
                corpora, granths, banis, sections, lines TO kosh_ingest;
GRANT INSERT ON text_blobs, token_layouts, tokens, source_snapshots, source_documents, source_lines, source_normalizations TO kosh_ingest;
GRANT UPDATE (last_checked_at, last_synced_at, notes, updated_at) ON sources TO kosh_ingest;
GRANT UPDATE (content_present) ON source_snapshots TO kosh_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kosh_ingest;
GRANT EXECUTE ON FUNCTION kosh.intern_text(text, integer) TO kosh_ingest;

-- application: full DML on public tables (still bound by every trigger and constraint), no DDL, no TRUNCATE
GRANT USAGE ON SCHEMA public, kosh, public_api TO kosh_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kosh_app;
GRANT DELETE ON sessions, security_events TO kosh_app;    -- the only tables where deletion is legitimate
GRANT SELECT ON ALL TABLES IN SCHEMA public_api TO kosh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kosh_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA kosh TO kosh_app;
