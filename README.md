# Pothi Sahib · Gurbani Kosh

**Pothi Sahib** is a privacy-first, offline-first Gurbani reader and personal Pothi builder (not yet built).
**Gurbani Kosh** is the source-aware, versioned, human-verified corpus underneath it, with a read-only public API (Milestone 1, working).

Read [`docs/PROJECT_PRINCIPLES.md`](docs/PROJECT_PRINCIPLES.md) first. Then
[`docs/architecture.md`](docs/architecture.md), [`docs/database.md`](docs/database.md) and
[`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md). `HANDOVER.md` is the current state for the next contributor.

## Status: Milestone 1 complete (2026-09-16)

A working, tested corpus spine:

- **Byte-exact text substrate** (content-addressed blobs, SHA-256 identity, immutability triggers) and an integrity core for Gurmukhi (codepoints, graphemes, offset tokens, diff kinds, one sanctioned normaliser).
- **Source registry** with enforced licence/redistribution recording; **immutable hashed snapshots** in a content-addressed object store; **strict parsers** (`txt`, `kosh-source/1`).
- **Corpus spine** (Corpus → Granth → Bani → Section → Line, no text on structure) and **versioned accepted text** that changes only through **two independent approvals by distinct Editors/Super Admins**, a recorded decision and an explicit publish; rollback as a new version.
- **Accounts** (username + Argon2id), **TOTP MFA** required for privileged roles, opaque sessions, lockout, append-only **audit log**.
- **Public read-only API** (`kosh_public` database role, GET only, OpenAPI) and a separate **authenticated admin API** (`kosh_app`), plus an operator **CLI**.
- **Tests: 257 passing** across integrity core, database adapter, database invariants (on real PostgreSQL via PGlite), services, HTTP workflow and a per-endpoint × per-role security matrix, including an end-to-end Unicode round trip.

**Milestone 2 (in progress):** first external source registered with its licence recorded (Shabad OS database, public-domain Gurbani data; adapter `shabados-sqlite-v1`, see ADR-0006 and `docs/source-candidates.md`); offline bundle endpoint with per-line and bundle SHA-256 and ETags; public text of historical versions; and the first vertical slice of the **Pothi Sahib reader PWA** (`apps/reader`): library, per-Bani download with hash verification into IndexedDB, offline reading, Pad Ched / true Larivaar, five themes and typography controls, provisional-source tag. Licence review of candidate sources is in `docs/source-candidates.md`.

Not yet built: bookmarks/Pothi Sahib builder, search UI, Shudh Roop correction reporting, source alignment/variance explorer, audio, forum, events. See `docs/requirements-traceability.md`.

## Layout

```
apps/reader         Pothi Sahib PWA (React + Vite + Dexie + Workbox)
packages/gurmukhi   integrity core (depends on nothing)
packages/domain     roles, permission matrix, vocabularies, validators
packages/db         Db abstraction (pg | PGlite), SET ROLE scoping, migration runner
packages/kosh-core  application services (sources, snapshots, parsing, structure, versions, accounts, MFA, sessions, audit)
services/api        public API + admin API (two processes)
tools/kosh-cli      operator CLI
corpus/             SQL migrations + database invariant tests
deployment/         docker-compose, Dockerfile, role init, backup/restore scripts
docs/               architecture, database, API, security, privacy, deployment, ADRs, traceability
scripts/            CI guards (dependency allowlist, normalisation ban)
```

## Quick start

```bash
pnpm install
pnpm verify                 # typecheck, lint, format, guards, all tests (PostgreSQL runs in-process; no Docker needed)
pnpm kosh migrate up        # DATABASE_URL defaults to pglite://./.data/kosh
pnpm dev:public             # http://localhost:8080/api/docs
```

See [`docs/local-development.md`](docs/local-development.md) for accounts, MFA and the ingestion walk-through, and
[`docs/deployment.md`](docs/deployment.md) for the Compose topology.

## Licensing

Software: Apache-2.0 (`LICENSE`). Corpus/data licensing is a **separate** concern documented in
[`docs/corpus-licensing.md`](docs/corpus-licensing.md); every source has its own recorded licence and redistribution status, enforced by the database.

## Stewardship

The corpus is maintained as a community resource. No contributor, administrator, organisation or
host owns the Gurbani content by virtue of contributing to or hosting the database. Dhur Ki Bani is
of the Guru and Akaal Purakh, available equally to everyone. Please do not make unnecessary or
disrespectful alterations when downloading or redistributing content. See [`docs/data-stewardship.md`](docs/data-stewardship.md).
