-- 0007 parse provenance, per-version approvals, and search keys.
--
-- (a) Parser provenance belongs on source_documents: a snapshot is frozen at retrieval time and
--     may be parsed later (or re-parsed with a newer parser), so parser_version/parsed_at live on
--     the document rows that the parse creates.
-- (b) Two-person decisions are collected as two INDEPENDENT approval actions on a DRAFT version by
--     two distinct eligible accounts. The second approval materialises the `decisions` row (whose
--     own trigger re-validates both approvers). Approvals are append-only and role-captured.
-- (c) Search keys are a DERIVED representation (first-letter key, compare-v1 text) keyed by blob
--     and key version. They are never used as source or accepted text.

ALTER TABLE source_documents
  ADD COLUMN parser_version text,
  ADD COLUMN input_format   text,
  ADD COLUMN parsed_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN line_count     integer NOT NULL DEFAULT 0 CHECK (line_count >= 0);

CREATE TABLE version_approvals (
  accepted_version_id  bigint      NOT NULL REFERENCES accepted_versions(id),
  user_id              bigint      NOT NULL REFERENCES users(id),
  role_at_time         role_name   NOT NULL,
  approved_at          timestamptz NOT NULL DEFAULT now(),
  notes                text,
  PRIMARY KEY (accepted_version_id, user_id),
  CONSTRAINT version_approvals_eligible_role CHECK (role_at_time IN ('EDITOR','SUPER_ADMIN'))
);
CREATE TRIGGER version_approvals_immutable BEFORE UPDATE OR DELETE ON version_approvals
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- The approver's role is CAPTURED here from the live grants, never supplied by the caller, and
-- only DRAFT versions may be approved.
CREATE OR REPLACE FUNCTION kosh.version_approvals_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status accepted_status; v_role role_name;
BEGIN
  SELECT status INTO v_status FROM accepted_versions WHERE id = NEW.accepted_version_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'accepted version % does not exist', NEW.accepted_version_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only DRAFT versions can be approved (version % is %)', NEW.accepted_version_id, v_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT r.role INTO v_role FROM user_roles r
   WHERE r.user_id = NEW.user_id AND r.revoked_at IS NULL AND r.role IN ('EDITOR','SUPER_ADMIN')
   ORDER BY CASE r.role WHEN 'SUPER_ADMIN' THEN 0 ELSE 1 END LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'user % holds no EDITOR/SUPER_ADMIN role and cannot approve', NEW.user_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.role_at_time := v_role;
  NEW.approved_at  := now();
  RETURN NEW;
END $$;
CREATE TRIGGER version_approvals_guard BEFORE INSERT ON version_approvals
  FOR EACH ROW EXECUTE FUNCTION kosh.version_approvals_guard();

CREATE TABLE blob_search_keys (
  blob_id           bigint NOT NULL REFERENCES text_blobs(id),
  key_version       text   NOT NULL,
  first_letter_key  text   NOT NULL COLLATE "C",
  compare_text      text   NOT NULL COLLATE "C",
  PRIMARY KEY (blob_id, key_version)
);
CREATE INDEX blob_search_keys_first_idx ON blob_search_keys (key_version, first_letter_key text_pattern_ops);
CREATE INDEX blob_search_keys_compare_trgm ON blob_search_keys USING gin (compare_text gin_trgm_ops);
CREATE TRIGGER blob_search_keys_immutable BEFORE UPDATE OR DELETE ON blob_search_keys
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- Public structure view: sections of Banis (structure carries no text, so no licence gate applies).
CREATE VIEW public_api.sections AS
  SELECT s.id, s.bani_id, s.parent_section_id, s.section_type, s.ordinal, s.label, s.metadata
  FROM sections s WHERE s.superseded_by IS NULL;

-- Public search view: only published, redistributable lines (inherits the gate from public_api.lines).
CREATE VIEW public_api.search_lines AS
  SELECT l.line_id, l.bani_id, l.section_id, l.ordinal, l.version_no, l.text, l.text_sha256_hex,
         k.key_version, k.first_letter_key, k.compare_text
  FROM public_api.lines l
  JOIN accepted_line_texts t ON t.line_id = l.line_id
  JOIN accepted_versions v ON v.id = t.accepted_version_id AND v.status = 'PUBLISHED' AND v.bani_id = l.bani_id
  JOIN blob_search_keys k ON k.blob_id = t.blob_id;

-- Grants for the new relations. Ingestion may now also WRITE audit rows (snapshot ingested,
-- document parsed) but still has nothing on the accepted layer or identity tables.
GRANT SELECT ON public_api.search_lines, public_api.sections TO kosh_public, kosh_app;
GRANT SELECT, INSERT ON blob_search_keys TO kosh_ingest;
GRANT INSERT ON audit_log TO kosh_ingest;
GRANT SELECT, INSERT, UPDATE ON version_approvals, blob_search_keys TO kosh_app;
