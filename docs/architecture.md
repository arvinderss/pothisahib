# Architecture

Two products, one platform: **Pothi Sahib** (the reader, not yet built) and **Gurbani Kosh** (the
source-aware, versioned, human-verified corpus with a read-only public API, built in Milestone 1).
The long-form reasoning is in [ARCHITECTURE_ASSESSMENT.md](ARCHITECTURE_ASSESSMENT.md); this page
describes what exists.

## Layers

```
packages/gurmukhi     integrity core: codepoints, graphemes, offset tokens, diff kinds, the ONLY normaliser
packages/domain       roles, permission matrix, state vocabularies, validators (no I/O)
packages/db           Db abstraction (pg | PGlite), SET ROLE scoping, migration runner
packages/kosh-core    application services: sources, snapshots, parsing, structure, accepted versions,
                      accounts, MFA, sessions, audit
services/api          public API (kosh_public role, GET only)  |  admin API (kosh_app role, authenticated)
tools/kosh-cli        operator CLI (migrations, registry, ingestion, accounts, adoption)
corpus/migrations     the schema: constraints and triggers are the product
```

Dependency direction is strictly downward; `packages/gurmukhi` depends on nothing.

## Runtime topology

```
 reader/PWA (Phase 3)          admin UI (later)            operator
        │ GET                       │ Bearer                   │ CLI
        ▼                           ▼                          ▼
 ┌──────────────┐          ┌──────────────────┐        ┌──────────────┐
 │ api-public   │          │ api-admin        │        │ kosh CLI     │
 │ role:        │          │ role: kosh_app   │        │ roles:       │
 │ kosh_public  │          │ sessions + MFA   │        │ ingest/app   │
 └──────┬───────┘          └────────┬─────────┘        └──────┬───────┘
        │ SELECT on public_api.*    │ DML, every trigger       │
        ▼                           ▼                          ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ PostgreSQL: text_blobs · source layer · spine · accepted layer ·    │
 │ decisions · identity · audit_log  (PGlite in dev/tests, pg in prod) │
 └─────────────────────────────────────────────────────────────────────┘
        ▲
 ┌──────┴───────┐
 │ object store │  content-addressed raw artefacts (filesystem now; S3 behind the same interface later)
 └──────────────┘
```

Two invariants the topology guarantees: **there is no path from the public API to a write**
(database grants, and the route table contains only GET), and **there is no path from ingestion
to the accepted layer** except through two approvals by distinct accounts recorded in `decisions`.

## Text model (the decision everything rests on)

Every string is stored once in `text_blobs` as exact UTF-8 bytes plus a SHA-256 (identity). Words
are codepoint offset ranges (`tokens`) into a blob. Structure (`lines`, `sections`, `banis`)
carries no text; a line's accepted text at a moment is an `accepted_line_texts` row pointing at a
blob. Source text (`source_lines`) points at blobs too, so "do two sources agree here" is an
integer comparison. Normalised comparison forms live in their own tables and never overwrite
anything. There is no mutable text column anywhere. See [corpus-model.md](corpus-model.md).

## Why PGlite

PGlite is PostgreSQL compiled to WebAssembly. The test-suite and zero-setup development run the
identical SQL migrations on it in-process; production runs the same migrations on a PostgreSQL
server. CI additionally applies, reverts and re-applies the migrations on a real `postgres:17`
service. See [adr/0002-pglite-for-tests-and-development.md](adr/0002-pglite-for-tests-and-development.md).

## What is deliberately absent from the server

Bookmarks, favourites, reading position, reading history and personal edits have no server tables:
they are reader-local (IndexedDB) by design (privacy, assessment §E.7, decision D-4).
