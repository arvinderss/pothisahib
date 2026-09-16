-- 0009 source document metadata and re-parse by parser version.
--
-- (a) Parsers may need to record facts about a document that are not lines: integrity findings in
--     the source itself (e.g. a compilation entry that points at a line the source does not have),
--     names, or the source's own ids. `metadata` holds them, immutably with the document.
-- (b) A snapshot may be parsed again by a NEWER parser version. The earlier documents stay (they
--     are immutable and may already be the basis of adopted text); the new ones sit beside them,
--     distinguished by parser_version. Uniqueness is therefore (snapshot, locator, parser_version).

ALTER TABLE source_documents ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source_documents DROP CONSTRAINT source_documents_snapshot_id_locator_key;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_snapshot_locator_parser_key
  UNIQUE (snapshot_id, locator, parser_version);
