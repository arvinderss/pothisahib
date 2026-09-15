# Source ingestion

```
External Source → register (licence!) → ingest snapshot (hash + immutable object) → parse
→ source_lines + normalisations + search keys → [structure bootstrap] → adoption draft
→ approval A → approval B → decision → publish
```

Nothing after "parse" happens automatically. Ingestion never touches the accepted layer; the
`kosh_ingest` database role has no grant on it at all.

## 1. Register the source and record its licence

```bash
pnpm kosh source add --slug shabados --name "Shabad OS database" --type DATABASE \
  --url https://github.com/shabados/database --publisher "Shabad OS" --as <editor>
# read the licence, then:
pnpm kosh source set --slug shabados --license "<SPDX or text>" --license-url <url> \
  --redistribution ATTRIBUTION_REQUIRED --status ACTIVE --as <editor>
```

A source cannot become ACTIVE without `license` and a `redistribution` other than UNKNOWN (CHECK
constraint), and ingestion refuses PROPOSED/RETIRED sources. **Do not guess licence terms; read
them.** Redistribution values: `ALLOWED`, `ATTRIBUTION_REQUIRED`, `PROHIBITED` (comparison-only,
never adopted, never public), `UNKNOWN`.

## 2. Ingest a snapshot

```bash
pnpm kosh snapshot ingest --source shabados --file ./downloads/shabados-2026-09.json --version 2026.09 --as <editor>
```

The artefact is hashed (SHA-256), written to the content-addressed object store
(`KOSH_OBJECT_STORE_DIR`), and recorded in `source_snapshots` with `fetched_at`, size and
declared version. An identical artefact for the same source is reported as a duplicate, not
stored twice. `sources.last_synced_at` is updated. Retention: raw artefacts may later be pruned
to latest-per-source (`content_present := false`); the hash row is kept forever (Q3 §36).

## 3. Parse

```bash
pnpm kosh snapshot parse --id <snapshotId> --format kosh-source-v1 --as <editor>
```

Formats:

- `txt`: one line per physical line; CRLF/LF; blank lines are lines; BOM is kept; invalid UTF-8 is an error.
- `kosh-source-v1`: the project's structured interchange JSON (documents → nested sections → lines
  with per-line locators). Per-source adapters (BaniDB, Shabad OS, hand transcription) should emit
  this so a single strict parser handles structure. Schema in
  `packages/kosh-core/src/formats/kosh-source-v1.ts`.

For every line the parser interns the exact text (`text_blobs`), records a `SOURCE_SPACING` token
layout, writes `encoding-v1` and `compare-v1` normalisations into `source_normalizations`, and
derived search keys into `blob_search_keys`. The document records `parser_version`,
`input_format`, `parsed_at`, `line_count`. Re-parsing a snapshot is refused (immutable); a new
parser version means a new snapshot row or a future explicit re-parse workflow.

## 4. Structure and adoption (see corpus-model.md)

```bash
pnpm kosh corpus ensure --corpus sggs:"Sri Guru Granth Sahib" --granth sggs:"…" --bani japji-sahib:"Japji Sahib" --as <editor>
pnpm kosh bani bootstrap --bani japji-sahib --document <documentId> --as <editor>
pnpm kosh version adopt --bani japji-sahib --document <documentId> --rationale "Adopt Shabad OS 2026.09 as provisional text" --as <editorA>
pnpm kosh version approve --id <versionId> --as <editorA>
pnpm kosh version approve --id <versionId> --as <editorB>     # creates the decision
pnpm kosh version publish --id <versionId> --as <editorB>     # explicit commit
```

The same operations exist on the admin HTTP API (docs/api.md).

## Unspaced (Larivaar-form) sources

Lines without whitespace still get a layout with one token; they cannot be adopted as spaced text
(RISK_REGISTER R-07) until an `ALIGNED_FROM_LAYOUT` or `HUMAN` layout exists (Phase 5).

## Images, PDFs, manuscripts

Register them as sources for **evidence and citation**; their text enters the corpus only through
human transcription (R-08). No OCR writes `source_lines`.
