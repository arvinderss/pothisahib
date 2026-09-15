# Corpus and data licensing

Software licence and corpus licence are separate. Nothing in this repository asserts ownership of
Gurbani; see [data-stewardship.md](data-stewardship.md).

## Per-source terms are recorded, enforced and public

Every external source has `license`, `license_url`, `attribution_text` and `redistribution` in
the `sources` table, visible at `GET /api/v1/sources`. The database enforces:

- a source cannot be ACTIVE without a recorded licence and a known redistribution status;
- text may be **adopted** only from ACTIVE sources whose redistribution is `ALLOWED` or `ATTRIBUTION_REQUIRED`;
- the public API and search expose only text whose lineage-root source is redistributable (view-level gate). A source later marked `PROHIBITED` disappears from public output without deleting anything.

`PROHIBITED` sources remain valuable as comparison material for reviewers and are never public.

## Attribution

When `redistribution = ATTRIBUTION_REQUIRED`, `attribution_text` must be carried by exports and
by the reader wherever that source's text or metadata is shown. The reader phase must implement
this before serving such text.

## The project's own accepted text

The accepted layer is derived from sources by human decisions and is intended to be available to
everyone equally. The precise licence label for the project's accepted corpus (for example a
CC0 or CC-BY dedication of the project's own contributions, subject to upstream terms) is an open
decision for the project owner and will be recorded here and as an ADR before the first public
dataset export.

## Rules

- Never assume "publicly accessible" means "redistributable".
- Read the licence; do not guess. Record where it was read (`license_url`) and when (`sources.updated_at`, audit log).
- Translations, transliterations and audio are sources too, each with their own terms (R-29).
