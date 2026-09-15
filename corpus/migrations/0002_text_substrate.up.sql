-- 0002 text substrate: content-addressed, byte-exact, immutable text; word boundaries as offsets.
-- See docs/ARCHITECTURE_ASSESSMENT.md §E.1 and docs/RISK_REGISTER.md R-07.

CREATE TABLE text_blobs (
  id              bigserial PRIMARY KEY,
  sha256          bytea       NOT NULL UNIQUE,
  raw_bytes       bytea       NOT NULL,                 -- DEFINITIVE representation (exact UTF-8 octets)
  raw_text        text        NOT NULL COLLATE "C",     -- query convenience; "C" so no locale can equate distinct sequences
  codepoint_count integer     NOT NULL CHECK (codepoint_count >= 0),
  grapheme_count  integer     NOT NULL CHECK (grapheme_count >= 0 AND grapheme_count <= codepoint_count),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT text_blobs_bytes_match_text CHECK (raw_bytes = convert_to(raw_text, 'UTF8')),
  CONSTRAINT text_blobs_sha_matches      CHECK (sha256 = sha256(raw_bytes)),
  CONSTRAINT text_blobs_cp_count_matches CHECK (codepoint_count = char_length(raw_text))
);
COMMENT ON TABLE text_blobs IS
  'Every distinct text in the system, stored once, byte-exact. Append-only. Identity = SHA-256 of UTF-8 bytes.';
CREATE TRIGGER text_blobs_immutable BEFORE UPDATE OR DELETE ON text_blobs
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- Convenience: insert-or-get a blob from text. Computes bytes, hash and codepoint count server-side
-- so callers cannot get them wrong. grapheme_count must be supplied by the caller (only the shared
-- gurmukhi library knows the segmentation rules) and is validated against codepoint_count above.
CREATE OR REPLACE FUNCTION kosh.intern_text(p_text text, p_grapheme_count integer) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_bytes bytea := convert_to(p_text, 'UTF8');
  v_id    bigint;
BEGIN
  SELECT id INTO v_id FROM text_blobs WHERE sha256 = sha256(v_bytes);
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO text_blobs (sha256, raw_bytes, raw_text, codepoint_count, grapheme_count)
  VALUES (sha256(v_bytes), v_bytes, p_text, char_length(p_text), p_grapheme_count)
  ON CONFLICT (sha256) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM text_blobs WHERE sha256 = sha256(v_bytes); END IF;
  RETURN v_id;
END $$;

CREATE TYPE token_layout_basis AS ENUM (
  'SOURCE_SPACING',       -- boundaries taken directly from whitespace present in the text
  'ALIGNED_FROM_LAYOUT',  -- text had no spacing; boundaries inferred by alignment to a spaced reading (confidence recorded)
  'HUMAN'                 -- boundaries set or corrected by a human
);

CREATE TABLE token_layouts (
  id                 bigserial PRIMARY KEY,
  blob_id            bigint      NOT NULL REFERENCES text_blobs(id),
  tokenizer_version  text        NOT NULL,
  basis              token_layout_basis NOT NULL,
  aligned_from_layout_id bigint  REFERENCES token_layouts(id),
  confidence         numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blob_id, tokenizer_version, basis),
  CONSTRAINT token_layouts_aligned_needs_source CHECK (basis <> 'ALIGNED_FROM_LAYOUT' OR aligned_from_layout_id IS NOT NULL),
  CONSTRAINT token_layouts_aligned_needs_confidence CHECK (basis <> 'ALIGNED_FROM_LAYOUT' OR confidence IS NOT NULL)
);
CREATE TRIGGER token_layouts_immutable BEFORE UPDATE OR DELETE ON token_layouts
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

CREATE TABLE tokens (
  layout_id  bigint  NOT NULL REFERENCES token_layouts(id),
  ordinal    integer NOT NULL CHECK (ordinal >= 0),
  cp_start   integer NOT NULL CHECK (cp_start >= 0),
  cp_end     integer NOT NULL,
  PRIMARY KEY (layout_id, ordinal),
  CONSTRAINT tokens_nonempty CHECK (cp_end > cp_start)
);
CREATE TRIGGER tokens_immutable BEFORE UPDATE OR DELETE ON tokens
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

-- Tokens must lie within their blob and must not overlap or run backwards.
CREATE OR REPLACE FUNCTION kosh.check_token_bounds() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_len integer; v_prev_end integer;
BEGIN
  SELECT b.codepoint_count INTO v_len FROM token_layouts l JOIN text_blobs b ON b.id = l.blob_id WHERE l.id = NEW.layout_id;
  IF NEW.cp_end > v_len THEN
    RAISE EXCEPTION 'token % ends at % beyond blob length %', NEW.ordinal, NEW.cp_end, v_len USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ordinal > 0 THEN
    SELECT cp_end INTO v_prev_end FROM tokens WHERE layout_id = NEW.layout_id AND ordinal = NEW.ordinal - 1;
    IF v_prev_end IS NULL THEN
      RAISE EXCEPTION 'token ordinals must be inserted contiguously (missing ordinal %)', NEW.ordinal - 1 USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.cp_start < v_prev_end THEN
      RAISE EXCEPTION 'token % overlaps previous token', NEW.ordinal USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tokens_bounds BEFORE INSERT ON tokens FOR EACH ROW EXECUTE FUNCTION kosh.check_token_bounds();
