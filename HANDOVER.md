# HANDOVER — Pothi Sahib / Gurbani Kosh

**Written:** 2026-09-16 (Milestone 1 complete)
**Author:** Claude (Claude Code session), for the next coding agent and for Dharam.
**Read order for a new agent:** this file → `docs/PROJECT_PRINCIPLES.md` → `docs/architecture.md` → `docs/database.md` → `docs/RISK_REGISTER.md` → `docs/ARCHITECTURE_ASSESSMENT.md` → the requirement documents in the parent folder.

---

## 1. Where everything is

| Location                                                | What                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C:\Users\User\Desktop\pothi sahib project\`            | Project root on Dharam's machine: the seven requirement documents, the Budha Dal index PDF, `ARCHITECTURE_ASSESSMENT.md`, this `HANDOVER.md` (copy). |
| `C:\Users\User\Desktop\pothi sahib project\pothisahib\` | **The repository.** Git-initialised on `main` with the Milestone-1 commit.                                                                           |
| `https://github.com/arvinderss/pothisahib`              | Remote. **Still empty**: nothing has been pushed (push needs Dharam's credentials; see §7).                                                          |

Toolchain installed on this machine during the session: Node 24.21.0 (portable, `%LOCALAPPDATA%\Programs\nodejs`, added to the user PATH; SHA-256 verified against nodejs.org) and pnpm 10.12.1 (`npm i -g`). No Docker, no PostgreSQL server, no Python.

Requirements priority (development instructions): questionnaires 1.0/2.0/3.0 → SRS v1.0 → project principles → external research → engineering judgment.

---

## 2. What the project is, in one paragraph

Two products in one platform. **Pothi Sahib** is a privacy-first, offline-first Gurbani reader and personal Pothi builder (React PWA, not yet built). **Gurbani Kosh** is the source-aware, versioned, human-verified corpus beneath it with a read-only public API (built in Milestone 1). The architectural commitment everything depends on: **source text, normalised text and accepted text are separate layers, and no mutable Gurbani text column exists anywhere.** Accepted text changes only by a new versioned row created through two independent approvals by distinct Editors/Super Admins and an explicit publish.

---

## 3. Milestone 1: what was built and verified

**Verified by running:** `pnpm verify` is green: typecheck, ESLint, Prettier, dependency-allowlist guard, normalisation guard, and **257 tests** (53 integrity core, 7 permission matrix, 7 database adapter, 24 database invariants, 26 service layer, 140 HTTP workflow + security matrix). A live public API process was also started against the smoke database and returned the published text byte-identically with correct headers and no write routes. The database tests run on real PostgreSQL (PGlite 0.5.8 = PostgreSQL 18.3 core). The CLI was smoke-tested end to end against a persisted PGlite database (migrate → users → MFA → bootstrap Super Admin → grant → source → ingest → parse → structure → adopt → two approvals → publish).

| Area                                                                                                                                                                                                                                                            | Status                                                           | Where                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Integrity core (codepoints, graphemes, offset tokens, diff kinds, one normaliser, first letters)                                                                                                                                                                | IMPLEMENTED, 53 tests                                            | `packages/gurmukhi`                                         |
| Migrations 0001–0007 (substrate, source layer, identity, spine + decisions + versions, audit + grants + views, approvals + search)                                                                                                                              | IMPLEMENTED; up/down/up proven on PGlite; every invariant tested | `corpus/migrations`, `corpus/test`                          |
| Db abstraction (pg + PGlite), `SET ROLE` scoping, migration runner with checksum immutability                                                                                                                                                                   | IMPLEMENTED                                                      | `packages/db`                                               |
| Roles, permission matrix, vocabularies, validators                                                                                                                                                                                                              | IMPLEMENTED                                                      | `packages/domain`                                           |
| Source registry with licence enforcement; hashed immutable snapshots; content-addressed object store (filesystem)                                                                                                                                               | IMPLEMENTED                                                      | `packages/kosh-core/src/{sources,snapshots,storage}.ts`     |
| Parsers `txt` and `kosh-source/1` (strict; fatal UTF-8) → source lines, layouts, normalisations, search keys                                                                                                                                                    | IMPLEMENTED                                                      | `packages/kosh-core/src/{formats,parse}.ts`                 |
| Corpus spine bootstrap from a parsed document                                                                                                                                                                                                                   | IMPLEMENTED                                                      | `packages/kosh-core/src/structure.ts`                       |
| Adoption draft → approval → approval (distinct) → decision → publish; rollback as new version                                                                                                                                                                   | IMPLEMENTED                                                      | `packages/kosh-core/src/accepted.ts`                        |
| Accounts (Argon2id), TOTP MFA (own RFC 6238 impl, vectors tested), sessions, lockout, audit                                                                                                                                                                     | IMPLEMENTED                                                      | `packages/kosh-core/src/{users,mfa,totp,sessions,audit}.ts` |
| Public read-only API (kosh_public, GET only, OpenAPI at `/api/v1/openapi.json`, docs at `/api/docs`)                                                                                                                                                            | IMPLEMENTED                                                      | `services/api/src/public`                                   |
| Admin API (kosh_app, bearer sessions, per-route `requireAction`, OpenAPI at `/admin/v1/openapi.json`)                                                                                                                                                           | IMPLEMENTED                                                      | `services/api/src/admin`                                    |
| Operator CLI (`pnpm kosh …`)                                                                                                                                                                                                                                    | IMPLEMENTED, smoke-tested (no automated tests)                   | `tools/kosh-cli`                                            |
| Docker Compose topology, Dockerfile, role init, backup/restore scripts                                                                                                                                                                                          | **UNVERIFIED** (no Docker / pg tools on this machine)            | `deployment/`                                               |
| CI: verify job on PGlite + migrations job on `postgres:17`                                                                                                                                                                                                      | **UNVERIFIED** (nothing pushed yet)                              | `.github/workflows/ci.yml`                                  |
| Docs: architecture, database, corpus-model, source-ingestion, correction-workflow, api, security, privacy, deployment, backup-restore, local-development, contributing, licensing, corpus-licensing, data-stewardship, fonts, requirements-traceability, 5 ADRs | WRITTEN                                                          | `docs/`                                                     |

Not built (by design, later phases): reader/PWA, offline bundles, Pothi Sahib builder, Shudh Roop reporting, correction issues/evidence, alignment/variance explorer, translations, audio, forum, events, security-question recovery, dataset exports.

---

## 4. Decisions taken in this session (see also `docs/adr/`)

| #        | Decision                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0001 | Ingestion in **TypeScript** sharing `packages/gurmukhi`; no Python port (one implementation of the Unicode rules).                                                                                                      |
| ADR-0002 | **PGlite** for tests and zero-setup development; identical SQL on PostgreSQL 17 in production and in a CI job.                                                                                                          |
| ADR-0003 | Two-person decisions collected as **two independent `version_approvals`** by distinct accounts; the second creates the `decisions` row; publish is a separate explicit action. Proposer may approve (R-13).             |
| ADR-0004 | **TOTP on node:crypto**, RFC-vector tested, no library.                                                                                                                                                                 |
| ADR-0005 | **Migration 0006 corrected in place** (CASE → `::actor_type` cast in the role-audit trigger) before the first commit; it had never been applied persistently anywhere. From now on applied migrations are never edited. |
| –        | Parser provenance (`parser_version`, `input_format`, `parsed_at`, `line_count`) lives on `source_documents` (0007), because snapshots are frozen at retrieval.                                                          |
| –        | Search keys are a derived table `blob_search_keys` (first-letter key + compare-v1 text) exposed through `public_api.search_lines`.                                                                                      |
| –        | Request logs carry method/path/status only; the admin rate limiter is in-memory per process; no address is persisted.                                                                                                   |
| D-1      | Apache-2.0 in place; **still awaiting Dharam's one-word confirmation**.                                                                                                                                                 |
| D-3      | Working names Pothi Sahib / Gurbani Kosh; API paths are now `/api/v1` and `/admin/v1` (name-neutral).                                                                                                                   |
| D-4      | Reader-local storage for bookmarks/favourites/history/personal edits (no server tables).                                                                                                                                |

Earlier decisions (R-02 provisional adoption, R-03 licence gate, R-05/R-06/R-07 columns, R-14/R-17 MFA rules, R-24 Unicode fonts only) stand and are implemented where they touch the schema.

---

## 5. Defects found and fixed during Milestone 1

- `kosh.audit_role_change()` (0006): CASE yielded `text` for an `actor_type` column → every role grant failed. Found by the new invariant tests; fixed in place (ADR-0005).
- `listSnapshots()` built its column list with a string replace that corrupted `source_id`. Found by the HTTP security matrix (500 on an allowed request); fixed with an explicit column list.
- Test helper used `ON CONFLICT DO UPDATE` on an immutable table; corrected.

---

## 6. Environment notes and gotchas

- Run pnpm as `pnpm.cmd` from Git Bash on Windows (the sh shim mangles paths). PowerShell: plain `pnpm`.
- A PGlite data directory is single-process. Use a PostgreSQL server to run both APIs and the CLI concurrently.
- `int8` ids are strings in application code under both drivers.
- Fixtures containing precomposed vs decomposed nukta must use `\u` escapes.
- `String.prototype.normalize` anywhere except `packages/gurmukhi/src/normalize.ts` fails lint and the guard script.
- `.data/` (PGlite dirs, object store) is git-ignored.

---

## 7. Blockers and open questions for Dharam

1. **Push to GitHub.** `git remote add origin https://github.com/arvinderss/pothisahib.git && git push -u origin main` with your credentials. CI will then run for the first time; expect to fix small environment issues in the `migrations-on-postgres` job.
2. **Confirm Apache-2.0** (or say MIT) before the first public release.
3. **Which external source first.** Licences have now been read (`docs/source-candidates.md`): **recommend Shabad OS** with the registry values proposed there; **BaniDB's terms are incompatible with adoption**. Please confirm, then the adapter and first real ingest proceed. Adoption from UNKNOWN/PROHIBITED sources is refused by the database.
4. **Docker verification.** Install Docker Desktop (or use a VPS) and run the Compose topology once; record the result in `docs/deployment.md`. Rehearse `deployment/backup/*.sh`.
5. (Non-blocking) R-21 anonymous forum posting; corpus licence label for the project's own accepted text (`docs/corpus-licensing.md`).

---

## 8. Milestone 2 progress (2026-09-16, same day)

Done and verified (`pnpm verify` green; 152 new/updated tests across api and reader; browser check of the reader against a live API and then with the API stopped):

- **Licence review** of the two candidate sources → `docs/source-candidates.md`. Shabad OS: MIT code, data marked public domain with a no-derogatory-treatment request → compatible. **BaniDB: Terms of Service require whole-database use, 90-day re-releases, contribution quotas and logo placement → incompatible with adoption**; comparison-only at most, pending Dharam's decision. No source has been registered.
- **Migration 0008** `public_api.version_lines`; endpoints `GET /api/v1/banis/{slug}/versions/{n}/lines` and `GET /api/v1/banis/{slug}/bundle` (kosh-bundle/1, per-line + bundle SHA-256, ETag/304). Contract in `packages/domain/src/bundle.ts`.
- **`apps/reader`** vertical slice: library grouped by Granth with verification badges, download → Web Crypto verification → IndexedDB, re-verification on read, offline reading, Pad Ched / true Larivaar, 5 themes + typography, provisional-source tag with attribution, reading position, device-local settings, Workbox app-shell precache (API never SW-cached), strict meta CSP. Builds to ~110 kB gzipped.
- `.env` loader (no dependency) for services and CLI; relative data paths resolve to the repository root. `.claude/launch.json` in the parent folder starts `api-public`, `api-admin`, `reader` for the browser pane.

Remaining for Milestone 2:

1. **First real source** (blocked on Dharam: confirm Shabad OS as the first source and the registry values proposed in `docs/source-candidates.md`; confirm BaniDB is not registered or is PROHIBITED/comparison-only). Then: adapter `@shabados/database` SQLite → `kosh-source/1` (one document per Bani, sections from their structure), ingest, parse, bootstrap Nitnem Banis, adopt through the two-person path.
2. Reader: bookmarks/favourites, Pothi Sahib builder (personal ordered lists), search UI over `/api/v1/search`, auto-scroll + wake-lock, keyboard navigation, install prompt, bundle update flow (ETag), font selection after the font licence audit (`docs/fonts.md`), Playwright e2e at phone/tablet/desktop/TV widths.
3. CI first run after push; Docker verification.

Then Milestone 3 (Shudh Roop reporting with anonymous identities and the correction issue model) per `docs/correction-workflow.md`.

---

## 9. Things the next agent must not do

- Do not add a mutable text column anywhere. Text is a `text_blobs` reference.
- Do not call `String.prototype.normalize` outside the sanctioned module.
- Do not edit an applied migration; write a new one (the runner refuses by checksum).
- Do not seed Gurbani into any table for tests; fixtures are synthetic and labelled.
- Do not add analytics, error-tracking SaaS, third-party script origins, or persist IP addresses.
- Do not register or snapshot a source without reading and recording its licence.
- Do not present PROVISIONAL text to readers without its source tag.
- Do not expose the admin API publicly; it binds to loopback for a reason.
