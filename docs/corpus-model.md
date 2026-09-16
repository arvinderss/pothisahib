# Corpus model

## Three layers, never collapsed

| Layer                   | Where                                                                   | Mutability                                  | Who writes                       |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| SOURCE                  | `source_snapshots` → `source_documents` → `source_lines` → `text_blobs` | immutable                                   | ingestion (`kosh_ingest`)        |
| NORMALISED / COMPARISON | `source_normalizations`, `blob_search_keys`                             | immutable, derived, versioned by normaliser | ingestion                        |
| ACCEPTED                | `accepted_versions` → `accepted_line_texts` → `text_blobs`              | append-only versions                        | two-person decision (`kosh_app`) |

The reader shows the ACCEPTED layer. The SOURCE layer is evidence and comparison material.
Normalisation never writes back to either.

## Hierarchy

```
Corpus → Granth → Bani → Section (recursive: Pauri / Ashtpadi / Chaupai / Salok …) → Line → Word → codepoint range
```

- `lines` are structural identities with no text. Bookmarks, alignments, corrections and audit
  rows can point at a line while its accepted text changes across versions.
- A word is `(line, token ordinal)`; a character range is `(line, cp_start, cp_end)`. Offsets are
  Unicode **codepoints** (not UTF-16 units, not bytes), computed by `packages/gurmukhi`, so they
  are stable across JavaScript, SQL and any future Python tooling.
- **True Larivaar** is a presentation of tokens joined without separators; the stored text and
  layout are untouched (`larivaarView` in `packages/gurmukhi`).

## Unicode preservation mechanism

1. Exact UTF-8 octets are stored (`raw_bytes bytea`), with SHA-256 identity; a CHECK ties
   `raw_text` to the bytes so no collation or normalisation can drift them apart.
2. `raw_text` uses `COLLATE "C"`: distinct sequences are never equal.
3. `String.prototype.normalize` is forbidden outside `packages/gurmukhi/src/normalize.ts` by
   ESLint **and** by `scripts/check-no-normalize.mjs`. That module never calls `.normalize`
   either: Gurmukhi's only canonical equivalences (six composition-excluded nukta letters) are
   handled by an explicit table, producing a **separate** comparison form.
4. Parsers decode UTF-8 with `fatal: true`; invalid bytes are an error, never repaired.
5. Round-trip tests push adversarial fixtures (matra pairs, bindi vs tippi, visarg, addak, nukta
   precomposed vs decomposed, ZWNJ/ZWJ, NBSP, dandas, word-boundary and line-break changes)
   through ingest → PostgreSQL → HTTP JSON and assert byte identity and SHA-256 equality.

## Source annotation layers

Some sources embed editorial annotations inside their text (Shabad OS's pause marks). An adapter
may separate such a layer from the words, but only deterministically, versioned by the parser,
with the composite string recorded verbatim in the line locator and the raw artefact kept as the
snapshot, so the original is always recoverable. The separated layer is data (positions and
kinds), never discarded. See ADR-0006.

## Provisional adoption

Given rigorous upstream sources, the realistic first step for a Bani is to **adopt** one source
document's text wholesale as accepted v1, by a two-person decision of kind `SOURCE_ADOPTION`,
tagging the Bani `PROVISIONAL`. Cross-source review then produces `CORRECTION` decisions and the
state `REVIEWED`. The reader must display the provisional tag ("adopted from _source_, synced
_date_; review pending"). Adoption is impossible from a source that is not ACTIVE or whose
redistribution is not ALLOWED/ATTRIBUTION_REQUIRED (database trigger).

## What Milestone 1 does not yet model

Correction issues, reports, proposals, evidence (Phase 4); cross-source alignment and diff
findings (Phase 5); translations, transliterations, audio, forum, events (later phases). The
`decisions.correction_issue_id` column and the `DiffKind` taxonomy are already in place for them.
