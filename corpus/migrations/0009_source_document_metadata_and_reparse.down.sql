ALTER TABLE source_documents DROP CONSTRAINT IF EXISTS source_documents_snapshot_locator_parser_key;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_snapshot_id_locator_key UNIQUE (snapshot_id, locator);
ALTER TABLE source_documents DROP COLUMN IF EXISTS metadata;
