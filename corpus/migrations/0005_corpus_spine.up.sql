-- 0005 corpus spine, two-person decisions, versioned accepted text.
-- docs/ARCHITECTURE_ASSESSMENT.md §E.2/§E.4/§E.6; RISK_REGISTER R-01..R-06.
-- No table in this migration has a mutable text column. Text is only ever a reference to text_blobs.

CREATE TYPE verification_state AS ENUM (
  'SOURCE_ONLY',   -- source text exists (or not); nothing adopted; reader shows nothing or a tagged source view
  'PROVISIONAL',   -- accepted text adopted wholesale from one source by two-person decision; tagged in the reader
  'REVIEWED',      -- cross-source review completed by humans
  'LOCKED'         -- verified and locked; only SUPER_ADMIN may unlock
);

CREATE TABLE corpora (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER corpora_no_delete BEFORE DELETE ON corpora FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();

CREATE TABLE granths (
  id          bigserial PRIMARY KEY,
  corpus_id   bigint NOT NULL REFERENCES corpora(id),
  slug        text   NOT NULL UNIQUE,
  name        text   NOT NULL,
  ordinal     integer NOT NULL DEFAULT 0,
  metadata    jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER granths_no_delete BEFORE DELETE ON granths FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();

CREATE TABLE banis (
  id                  bigserial PRIMARY KEY,
  granth_id           bigint NOT NULL REFERENCES granths(id),
  slug                text   NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name                text   NOT NULL,                 -- display name (Gurmukhi or transliterated as appropriate)
  verification_state  verification_state NOT NULL DEFAULT 'SOURCE_ONLY',
  ordinal             integer NOT NULL DEFAULT 0,
  metadata            jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- author, mahalla, raag, ang range, section type, references … (extensible, SRS §13)
  structure_basis_snapshot_id bigint REFERENCES source_snapshots(id),  -- which source's segmentation bootstrapped the spine (R-05)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER banis_no_delete BEFORE DELETE ON banis FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();
CREATE TRIGGER banis_updated_at BEFORE UPDATE ON banis FOR EACH ROW EXECUTE FUNCTION kosh.set_updated_at();

CREATE TABLE bani_aliases (
  bani_id  bigint NOT NULL REFERENCES banis(id),
  alias    text   NOT NULL,
  language text,
  PRIMARY KEY (bani_id, alias)
);

-- Sections are recursive so Section -> Pauri / Ashtpadi / Chaupai / Salok … need no schema change.
CREATE TABLE sections (
  id                 bigserial PRIMARY KEY,
  bani_id            bigint  NOT NULL REFERENCES banis(id),
  parent_section_id  bigint  REFERENCES sections(id),
  section_type       text    NOT NULL,        -- free vocabulary, documented in docs/corpus-model.md
  ordinal            integer NOT NULL,
  label              text,
  metadata           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  superseded_by      bigint  REFERENCES sections(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sections_bani_idx ON sections (bani_id, parent_section_id, ordinal);
CREATE TRIGGER sections_no_delete BEFORE DELETE ON sections FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();

-- A line is a STRUCTURAL identity. It carries no text. Its text at any moment is given by accepted_line_texts.
CREATE TABLE lines (
  id                          bigserial PRIMARY KEY,
  bani_id                     bigint  NOT NULL REFERENCES banis(id),
  section_id                  bigint  NOT NULL REFERENCES sections(id),
  ordinal                     integer NOT NULL,
  structure_basis_snapshot_id bigint  REFERENCES source_snapshots(id),
  superseded_by               bigint  REFERENCES lines(id),      -- set when a structure revision splits/merges this line (R-05)
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lines_section_idx ON lines (section_id, ordinal);
CREATE INDEX lines_bani_idx ON lines (bani_id);
CREATE TRIGGER lines_no_delete BEFORE DELETE ON lines FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();

-- Collections (Maryada / institution / tradition orderings). A Bani may appear in many; a collection
-- may reference a VARIANT of a Bani whose line inclusion differs by tradition (R-06).
CREATE TABLE collections (
  id           bigserial PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  institution  text,
  tradition    text,
  description  text,
  source_id    bigint REFERENCES sources(id),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bani_variants (
  id           bigserial PRIMARY KEY,
  bani_id      bigint NOT NULL REFERENCES banis(id),
  slug         text   NOT NULL,
  name         text   NOT NULL,           -- e.g. the tradition or institution whose reading this is
  description  text,
  source_id    bigint REFERENCES sources(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bani_id, slug)
);
CREATE TABLE bani_variant_ranges (      -- ordered inclusive line ranges over the spine
  variant_id     bigint  NOT NULL REFERENCES bani_variants(id),
  ordinal        integer NOT NULL,
  first_line_id  bigint  NOT NULL REFERENCES lines(id),
  last_line_id   bigint  NOT NULL REFERENCES lines(id),
  PRIMARY KEY (variant_id, ordinal)
);

CREATE TABLE collection_items (
  collection_id    bigint  NOT NULL REFERENCES collections(id),
  ordinal          integer NOT NULL,
  bani_id          bigint  NOT NULL REFERENCES banis(id),
  bani_variant_id  bigint  REFERENCES bani_variants(id),
  notes            text,
  PRIMARY KEY (collection_id, ordinal)
);

-- ---------------------------------------------------------------------------------------------
-- Two-person decisions: the ONLY artefact that can cause accepted text to change.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE decision_kind AS ENUM (
  'SOURCE_ADOPTION',       -- adopt one source snapshot's text for a Bani as the accepted reading (PROVISIONAL)
  'CORRECTION',            -- a reviewed correction to one or more lines
  'ROLLBACK',              -- revert to a previous accepted version (creates a NEW version)
  'STRUCTURE_REVISION',    -- split/merge/reorder lines or sections
  'LOCK', 'UNLOCK'
);

CREATE TABLE decisions (
  id                   bigserial PRIMARY KEY,
  kind                 decision_kind NOT NULL,
  bani_id              bigint      NOT NULL REFERENCES banis(id),
  approver_1           bigint      NOT NULL REFERENCES users(id),
  approver_1_role      role_name   NOT NULL,
  approver_2           bigint      NOT NULL REFERENCES users(id),
  approver_2_role      role_name   NOT NULL,
  decided_at           timestamptz NOT NULL DEFAULT now(),
  rationale            text        NOT NULL,
  source_snapshot_id   bigint      REFERENCES source_snapshots(id),   -- required for SOURCE_ADOPTION
  correction_issue_id  bigint,                                        -- FK added when correction tables land (Phase 4)
  CONSTRAINT decisions_two_distinct_approvers CHECK (approver_1 <> approver_2),
  CONSTRAINT decisions_eligible_roles CHECK (approver_1_role IN ('EDITOR','SUPER_ADMIN') AND approver_2_role IN ('EDITOR','SUPER_ADMIN')),
  CONSTRAINT decisions_adoption_needs_snapshot CHECK (kind <> 'SOURCE_ADOPTION' OR source_snapshot_id IS NOT NULL),
  CONSTRAINT decisions_unlock_needs_super_admin CHECK (kind <> 'UNLOCK' OR (approver_1_role = 'SUPER_ADMIN' AND approver_2_role = 'SUPER_ADMIN'))
);
CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON decisions FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- Approver roles are CAPTURED at decision time and must have been genuinely held then; a later
-- role change can neither validate nor invalidate a past decision. Adoption is refused from any
-- source the project may not redistribute (R-03).
CREATE OR REPLACE FUNCTION kosh.validate_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_redist redistribution_status; v_status source_status;
BEGIN
  IF NOT kosh.user_had_role_at(NEW.approver_1, ARRAY[NEW.approver_1_role]::role_name[], NEW.decided_at) THEN
    RAISE EXCEPTION 'approver_1 (%) did not hold role % at %', NEW.approver_1, NEW.approver_1_role, NEW.decided_at USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT kosh.user_had_role_at(NEW.approver_2, ARRAY[NEW.approver_2_role]::role_name[], NEW.decided_at) THEN
    RAISE EXCEPTION 'approver_2 (%) did not hold role % at %', NEW.approver_2, NEW.approver_2_role, NEW.decided_at USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.kind = 'SOURCE_ADOPTION' THEN
    SELECT s.redistribution, s.status INTO v_redist, v_status
      FROM source_snapshots sn JOIN sources s ON s.id = sn.source_id WHERE sn.id = NEW.source_snapshot_id;
    IF v_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'cannot adopt from a source that is not ACTIVE' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF v_redist NOT IN ('ALLOWED','ATTRIBUTION_REQUIRED') THEN
      RAISE EXCEPTION 'cannot adopt text from a source whose redistribution status is % (RISK_REGISTER R-03)', v_redist
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER decisions_validate BEFORE INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION kosh.validate_decision();

-- ---------------------------------------------------------------------------------------------
-- Accepted versions: append-only; publication requires a decision; rollback is a new version.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE accepted_status AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED');
CREATE TYPE accepted_basis  AS ENUM ('SOURCE_ADOPTION','REVIEWED_CORRECTION','ROLLBACK','STRUCTURE_REVISION');

CREATE TABLE accepted_versions (
  id                 bigserial PRIMARY KEY,
  bani_id            bigint          NOT NULL REFERENCES banis(id),
  version_no         integer         NOT NULL,
  status             accepted_status NOT NULL DEFAULT 'DRAFT',
  basis              accepted_basis  NOT NULL,
  basis_source_id    bigint          REFERENCES sources(id),          -- lineage root for the public-exposure gate; inherited by later versions
  decision_id        bigint          REFERENCES decisions(id),
  previous_version_id bigint         REFERENCES accepted_versions(id),
  rolled_back_to_id  bigint          REFERENCES accepted_versions(id),
  created_by         bigint          NOT NULL REFERENCES users(id),
  created_at         timestamptz     NOT NULL DEFAULT now(),
  published_at       timestamptz,
  rationale          text,
  UNIQUE (bani_id, version_no),
  CONSTRAINT accepted_rollback_needs_target CHECK (basis <> 'ROLLBACK' OR rolled_back_to_id IS NOT NULL)
);
CREATE UNIQUE INDEX accepted_versions_one_published_per_bani ON accepted_versions (bani_id) WHERE status = 'PUBLISHED';
CREATE INDEX accepted_versions_bani_idx ON accepted_versions (bani_id, version_no);

CREATE OR REPLACE FUNCTION kosh.accepted_versions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_kind decision_kind; v_decision_bani bigint; v_prev_source bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'accepted_versions is append-only (rule 15)' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- version numbers are assigned here, monotonically, never by the caller
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO NEW.version_no FROM accepted_versions WHERE bani_id = NEW.bani_id;
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a new accepted version must be inserted as DRAFT and published by a separate UPDATE' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- inherit lineage root from the previous version when not an adoption
    IF NEW.basis <> 'SOURCE_ADOPTION' AND NEW.basis_source_id IS NULL AND NEW.previous_version_id IS NOT NULL THEN
      SELECT basis_source_id INTO v_prev_source FROM accepted_versions WHERE id = NEW.previous_version_id;
      NEW.basis_source_id := v_prev_source;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: the only permitted transitions are DRAFT -> PUBLISHED and PUBLISHED -> SUPERSEDED.
  IF NEW.bani_id <> OLD.bani_id OR NEW.version_no <> OLD.version_no OR NEW.basis <> OLD.basis
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
     OR NEW.rolled_back_to_id IS DISTINCT FROM OLD.rolled_back_to_id
     OR NEW.basis_source_id IS DISTINCT FROM OLD.basis_source_id THEN
    RAISE EXCEPTION 'accepted_versions: only status/decision/published_at may change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED' THEN
    IF NEW.decision_id IS NULL THEN
      RAISE EXCEPTION 'publishing requires a two-person decision (rules 4, 5)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT kind, bani_id INTO v_kind, v_decision_bani FROM decisions WHERE id = NEW.decision_id;
    IF v_decision_bani <> NEW.bani_id THEN
      RAISE EXCEPTION 'decision % belongs to a different Bani', NEW.decision_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF (NEW.basis = 'SOURCE_ADOPTION'     AND v_kind <> 'SOURCE_ADOPTION')
    OR (NEW.basis = 'REVIEWED_CORRECTION' AND v_kind <> 'CORRECTION')
    OR (NEW.basis = 'ROLLBACK'            AND v_kind <> 'ROLLBACK')
    OR (NEW.basis = 'STRUCTURE_REVISION'  AND v_kind <> 'STRUCTURE_REVISION') THEN
      RAISE EXCEPTION 'decision kind % does not match version basis %', v_kind, NEW.basis USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.basis = 'SOURCE_ADOPTION' AND NEW.basis_source_id IS NULL THEN
      RAISE EXCEPTION 'SOURCE_ADOPTION version must record basis_source_id' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM accepted_line_texts t WHERE t.accepted_version_id = NEW.id) THEN
      RAISE EXCEPTION 'cannot publish an accepted version with no line texts' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    NEW.published_at := COALESCE(NEW.published_at, now());
    -- supersede the currently published version, if any
    UPDATE accepted_versions SET status = 'SUPERSEDED' WHERE bani_id = NEW.bani_id AND status = 'PUBLISHED' AND id <> NEW.id;
    -- adoption moves the Bani to PROVISIONAL; a reviewed correction to REVIEWED (unless LOCKED)
    UPDATE banis SET verification_state =
      CASE WHEN verification_state = 'LOCKED' THEN 'LOCKED'
           WHEN NEW.basis = 'SOURCE_ADOPTION' THEN 'PROVISIONAL'
           WHEN NEW.basis IN ('REVIEWED_CORRECTION','ROLLBACK') THEN 'REVIEWED'
           ELSE verification_state END
      WHERE id = NEW.bani_id;
    RETURN NEW;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status AND OLD.decision_id IS NULL AND NEW.decision_id IS NOT NULL AND OLD.status = 'DRAFT' THEN
    RETURN NEW; -- attaching a decision to a draft before publishing
  END IF;
  RAISE EXCEPTION 'illegal accepted_versions transition % -> %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER accepted_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON accepted_versions
  FOR EACH ROW EXECUTE FUNCTION kosh.accepted_versions_guard();

CREATE TABLE accepted_line_texts (
  accepted_version_id  bigint NOT NULL REFERENCES accepted_versions(id),
  line_id              bigint NOT NULL REFERENCES lines(id),
  blob_id              bigint NOT NULL REFERENCES text_blobs(id),
  layout_id            bigint NOT NULL REFERENCES token_layouts(id),
  derived_from_source_line_id bigint REFERENCES source_lines(id),   -- provenance of this exact reading, when adopted
  PRIMARY KEY (accepted_version_id, line_id)
);
CREATE INDEX accepted_line_texts_line_idx ON accepted_line_texts (line_id);
-- Line texts may only be written while their version is a DRAFT; afterwards they are frozen.
CREATE OR REPLACE FUNCTION kosh.accepted_line_texts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status accepted_status; v_ver bigint;
BEGIN
  v_ver := CASE WHEN TG_OP = 'DELETE' THEN OLD.accepted_version_id ELSE NEW.accepted_version_id END;
  SELECT status INTO v_status FROM accepted_versions WHERE id = v_ver;
  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'accepted_line_texts of a % version are frozen', v_status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  -- the layout must describe this exact blob
  IF NOT EXISTS (SELECT 1 FROM token_layouts l WHERE l.id = NEW.layout_id AND l.blob_id = NEW.blob_id) THEN
    RAISE EXCEPTION 'layout % does not belong to blob %', NEW.layout_id, NEW.blob_id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accepted_line_texts_guard BEFORE INSERT OR UPDATE OR DELETE ON accepted_line_texts
  FOR EACH ROW EXECUTE FUNCTION kosh.accepted_line_texts_guard();

-- Bani locks (SRS §36). Only SUPER_ADMIN may unlock (enforced via decision kind UNLOCK constraint).
CREATE TABLE bani_locks (
  id            bigserial PRIMARY KEY,
  bani_id       bigint      NOT NULL REFERENCES banis(id),
  lock_decision_id   bigint NOT NULL REFERENCES decisions(id),
  unlock_decision_id bigint REFERENCES decisions(id),
  reason        text        NOT NULL,
  locked_at     timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz
);
CREATE UNIQUE INDEX bani_locks_one_active ON bani_locks (bani_id) WHERE released_at IS NULL;
CREATE TRIGGER bani_locks_no_delete BEFORE DELETE ON bani_locks FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();
