DROP VIEW IF EXISTS public_api.search_lines;
DROP VIEW IF EXISTS public_api.sections;
DROP TABLE IF EXISTS blob_search_keys;
DROP TRIGGER IF EXISTS version_approvals_guard ON version_approvals;
DROP FUNCTION IF EXISTS kosh.version_approvals_guard();
DROP TABLE IF EXISTS version_approvals;
ALTER TABLE source_documents
  DROP COLUMN IF EXISTS line_count,
  DROP COLUMN IF EXISTS parsed_at,
  DROP COLUMN IF EXISTS input_format,
  DROP COLUMN IF EXISTS parser_version;
