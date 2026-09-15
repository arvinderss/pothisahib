-- 0003 source layer: registry (mutable metadata, never deletable), immutable snapshots and lines,
-- and the SEPARATE normalised representation. docs/ARCHITECTURE_ASSESSMENT.md §E.3, RISK_REGISTER R-03/R-04.

CREATE TYPE source_type AS ENUM
  ('DATABASE','API','WEBSITE','HTML','PDF','IMAGE','MANUSCRIPT','PRINTED_BOOK','AUDIO','VIDEO','OTHER');

CREATE TYPE redistribution_status AS ENUM
  ('UNKNOWN','PROHIBITED','ATTRIBUTION_REQUIRED','ALLOWED');

CREATE TYPE source_status AS ENUM ('PROPOSED','ACTIVE','SUSPENDED','RETIRED');

CREATE TABLE sources (
  id               bigserial PRIMARY KEY,
  slug             text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name             text        NOT NULL,
  url              text,
  source_type      source_type NOT NULL,
  publisher        text,
  license          text,                      -- SPDX id or free text; required before ACTIVE
  license_url      text,
  attribution_text text,
  redistribution   redistribution_status NOT NULL DEFAULT 'UNKNOWN',
  import_method    text,
  status           source_status NOT NULL DEFAULT 'PROPOSED',
  last_checked_at  timestamptz,
  last_synced_at   timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- A source may only become ACTIVE once its licence position has been recorded (SRS §39/§81).
  CONSTRAINT sources_active_requires_license CHECK (status <> 'ACTIVE' OR (license IS NOT NULL AND redistribution <> 'UNKNOWN'))
);
CREATE TRIGGER sources_no_delete BEFORE DELETE ON sources FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();
CREATE TRIGGER sources_updated_at BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION kosh.set_updated_at();

-- An immutable record of one retrieval of one source artefact.
CREATE TABLE source_snapshots (
  id              bigserial PRIMARY KEY,
  source_id       bigint      NOT NULL REFERENCES sources(id),
  fetched_at      timestamptz NOT NULL,
  sha256          bytea       NOT NULL CHECK (octet_length(sha256) = 32),
  byte_size       bigint      NOT NULL CHECK (byte_size >= 0),
  storage_key     text        NOT NULL,        -- object-storage key of the raw artefact (may later be pruned to latest-per-source; the hash row stays)
  content_present boolean     NOT NULL DEFAULT true,
  source_version  text,                        -- version label as the source expresses it
  parser_version  text,
  imported_at     timestamptz,
  notes           text,
  UNIQUE (source_id, sha256)
);
COMMENT ON TABLE source_snapshots IS
  'One row per retrieval. Hash + fetched_at are retained forever even if the artefact content is pruned (Q3 §36).';
-- content_present is the ONE column that may change (true -> false when pruning). Everything else is frozen.
CREATE OR REPLACE FUNCTION kosh.source_snapshots_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'source_snapshots is append-only' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.source_id <> OLD.source_id OR NEW.fetched_at <> OLD.fetched_at OR NEW.sha256 <> OLD.sha256
     OR NEW.byte_size <> OLD.byte_size OR NEW.storage_key <> OLD.storage_key
     OR NEW.source_version IS DISTINCT FROM OLD.source_version
     OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
     OR NEW.imported_at IS DISTINCT FROM OLD.imported_at
     OR (OLD.content_present = false AND NEW.content_present = true) THEN
    RAISE EXCEPTION 'source_snapshots: only content_present may change, and only true -> false' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_snapshots_guard BEFORE UPDATE OR DELETE ON source_snapshots
  FOR EACH ROW EXECUTE FUNCTION kosh.source_snapshots_guard();

-- A logical document within a snapshot (a file, a table, an Ang range, a page).
CREATE TABLE source_documents (
  id           bigserial PRIMARY KEY,
  snapshot_id  bigint NOT NULL REFERENCES source_snapshots(id),
  locator      text   NOT NULL,      -- path / table / page identifier within the artefact
  title        text,
  ordinal      integer NOT NULL DEFAULT 0,
  UNIQUE (snapshot_id, locator)
);
CREATE TRIGGER source_documents_immutable BEFORE UPDATE OR DELETE ON source_documents
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- The immutable parsed source text, one row per line as the source segmented it.
CREATE TABLE source_lines (
  id            bigserial PRIMARY KEY,
  snapshot_id   bigint  NOT NULL REFERENCES source_snapshots(id),
  document_id   bigint  REFERENCES source_documents(id),
  ordinal       integer NOT NULL CHECK (ordinal >= 0),
  blob_id       bigint  NOT NULL REFERENCES text_blobs(id),
  layout_id     bigint  REFERENCES token_layouts(id),   -- SOURCE_SPACING layout when spacing exists; NULL for unspaced sources
  locator       jsonb,                                   -- ang / shabad / line identifiers as the source expressed them
  UNIQUE (snapshot_id, document_id, ordinal)
);
CREATE INDEX source_lines_blob_idx ON source_lines (blob_id);
CREATE TRIGGER source_lines_immutable BEFORE UPDATE OR DELETE ON source_lines
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- The SEPARATE comparison representation. Never written back to source_lines or accepted text.
CREATE TABLE source_normalizations (
  source_line_id      bigint NOT NULL REFERENCES source_lines(id),
  normalizer_version  text   NOT NULL,
  profile             text   NOT NULL,          -- encoding-v1 | compare-v1 | skeleton-v1
  normalized_blob_id  bigint NOT NULL REFERENCES text_blobs(id),
  PRIMARY KEY (source_line_id, normalizer_version, profile)
);
CREATE TRIGGER source_normalizations_immutable BEFORE UPDATE OR DELETE ON source_normalizations
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();
