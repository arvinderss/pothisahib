-- 0008 public version history text.
-- Readers and researchers may see the text of SUPERSEDED versions (SRS §35: "each version retains
-- previous text"). The same licence gate applies: only lineage sources that permit redistribution.
-- Drafts are never visible.

CREATE VIEW public_api.version_lines AS
  SELECT v.id AS version_id, v.version_no, v.status, v.basis, v.basis_source_id, v.published_at,
         l.id AS line_id, l.bani_id, l.section_id, l.ordinal,
         tb.raw_text AS text, encode(tb.sha256, 'hex') AS text_sha256_hex, tb.codepoint_count, tb.grapheme_count,
         t.layout_id
  FROM accepted_versions v
  JOIN accepted_line_texts t ON t.accepted_version_id = v.id
  JOIN lines l ON l.id = t.line_id
  JOIN text_blobs tb ON tb.id = t.blob_id
  JOIN sources src ON src.id = v.basis_source_id
  WHERE v.status IN ('PUBLISHED', 'SUPERSEDED') AND src.redistribution IN ('ALLOWED', 'ATTRIBUTION_REQUIRED');

-- Tokens must be readable for every layout that appears in any public version, not only the published one.
CREATE OR REPLACE VIEW public_api.tokens AS
  SELECT tk.layout_id, tk.ordinal, tk.cp_start, tk.cp_end
  FROM tokens tk WHERE tk.layout_id IN (SELECT layout_id FROM public_api.version_lines);

GRANT SELECT ON public_api.version_lines TO kosh_public, kosh_app;
