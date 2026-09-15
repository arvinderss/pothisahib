# Pothi Sahib / Gurbani Kosh — Architecture Assessment & Phase-1 Plan

**Document:** `docs/ARCHITECTURE_ASSESSMENT.md` (v1.0)
**Date:** 2026-09-15
**Status:** Assessment only. No code was written or modified.
**Sources of truth, in priority order:** requirements questionnaires 1.0 / 2.0 / 3.0 → SRS v1.0 → project principles → external research → engineering judgment.

---

## 0. Inspection Findings

The ten inspection questions were answered by direct examination, not inference.

| #   | Question                             | Finding                                                                                                                                                                                                                                            | Evidence                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Current repository structure         | **None.** `github.com/arvinderss/pothisahib` clones successfully but is an **empty repository** — no commits, no branches, no refs. `git ls-remote` returns nothing; `git log` reports "your current branch 'main' does not have any commits yet". | Clone + `ls-remote` + `log`                   |
| 2   | Existing technologies / dependencies | **None.** No `package.json`, `pyproject.toml`, lockfile, or any manifest exists anywhere.                                                                                                                                                          | Repo empty; connected folder contains no code |
| 3   | Existing application functionality   | **None.** Zero lines of application code exist.                                                                                                                                                                                                    | As above                                      |
| 4   | Existing database / schema           | **None.** No migrations, no DDL, no ORM models, no ERD artifact.                                                                                                                                                                                   | As above                                      |
| 5   | Existing configuration               | **None.** No `.env.example`, no Docker/Compose files, no CI config, no linter/formatter config.                                                                                                                                                    | As above                                      |
| 6   | Existing tests                       | **None.** No test framework, no test files, no fixtures.                                                                                                                                                                                           | As above                                      |
| 7   | Existing deployment configuration    | **None.** No Dockerfile, Compose file, workflow, or host configuration.                                                                                                                                                                            | As above                                      |
| 8   | Current Git status                   | Remote exists and is reachable; **default branch `main` has no commits**. Nothing to preserve, nothing at risk of being overwritten. Local working copy: none — the connected folder `Desktop\pothi sahib project` is **not** a Git working tree.  | Clone + folder listing                        |
| 9   | Requirements already implemented     | **Zero (0%).**                                                                                                                                                                                                                                     | —                                             |
| 10  | Requirements partially implemented   | **Zero (0%).**                                                                                                                                                                                                                                     | —                                             |
| 11  | Requirements not implemented         | **All of them (100%).**                                                                                                                                                                                                                            | —                                             |

**Local folder contents** (`C:\Users\User\Desktop\pothi sahib project`) — 8 files, all documentation, no code:
`instrutions.md`, `project princicples - non negotiable rules.md`, `requirement and design development instructions v1.0.txt`, `requirement document v1.0.txt`, `requirements questionnaire 1.0/2.0/3.0.txt`, and the Budha Dal Sundar Gutka index PDF (5.2 MB).

**Conclusion:** this is a **greenfield build**. Instruction §25 ("do not unnecessarily rewrite working code", "do not restart from scratch if an existing implementation is usable") is satisfied vacuously — there is nothing to preserve and nothing to avoid duplicating. Every architectural decision below is therefore made freely, with no legacy constraint.

---

## A. Current Architecture

There is no current architecture. To state it precisely rather than as a formality:

- **No runtime exists.** No frontend, no backend, no database, no worker, no storage layer.
- **No data exists.** No corpus, no source snapshots, no ingestion output. Critically, **no Gurbani text has been obtained from any source**, so there is nothing whose Unicode integrity could already have been compromised. The project starts clean on its highest-priority non-negotiable.
- **No provenance chain exists.** The Source Registry, snapshot hashing, and licensing records described in SRS §7/§39 are entirely unbuilt.
- **No authorization model exists.** The four roles (USER / REVIEWER / EDITOR / SUPER_ADMIN) are specified but unimplemented, so no privilege-escalation surface exists yet.
- **What does exist** is a genuinely unusually complete requirements corpus: three answered questionnaires, a 100-section SRS, a coding-agent instruction set, and an extracted non-negotiable principles file. The specification quality is well above typical for a project at commit zero. The risk here is not under-specification; it is **scope breadth versus a very small volunteer team**, addressed in §F.

The only pre-existing architectural commitment is the **naming/layering decision** already made in the SRS and questionnaires: two products inside one platform — **Pothi Sahib** (the reader/community application) and **Gurbani Kosh** (the source-aware, versioned, human-verified corpus and its read-only API). This assessment treats that separation as binding, because it is the decision that makes everything else in the requirements coherent.

---

## B. Requirements-to-Implementation Gap Analysis

Since implementation is at 0%, a per-requirement "implemented/partial/missing" table would be 100% "missing" and would carry no information. The useful analysis is **which gaps are architecturally load-bearing** — i.e. which, if deferred or got wrong, force a rewrite later rather than an addition.

Legend — **Lock-in risk**: _Critical_ = wrong choice requires re-ingesting or re-modelling the corpus; _High_ = requires schema migration with data loss risk; _Medium_ = contained refactor; _Low_ = additive.

### B.1 Corpus & integrity

| Requirement                                                                       | Ref                                      | Status          | Lock-in risk | Note                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------- | --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unicode-exact source preservation, original always recoverable                    | Q1 §A, Q2 §5, SRS P-01/§11, Instr §4/§30 | Not implemented | **Critical** | Must be established in the very first migration. Any text that enters the system before the byte-exactness guarantee exists is permanently suspect and must be re-ingested. |
| Source / normalized / accepted three-layer separation                             | Q2 §2, SRS §6, Principles                | Not implemented | **Critical** | Collapsing these later is not a migration, it is a restart.                                                                                                                 |
| Corpus hierarchy Corpus→Granth→Bani→Section→Stanza→Line→Word→character addressing | Q2 §1, SRS §5                            | Not implemented | **Critical** | Determines whether word-level long-press reporting and character-level diff are possible at all.                                                                            |
| Corpus versioning; rollback creates a new version                                 | Q2 §3, SRS §35, Instr §5                 | Not implemented | **Critical** | Retrofitting versioning onto mutable text loses all history predating the change.                                                                                           |
| Provenance: source, version, sync date, SHA-256, parser version                   | Q3 §35/§36, SRS §7/§8                    | Not implemented | **Critical** | Provenance cannot be reconstructed retrospectively.                                                                                                                         |
| Immutable raw snapshots                                                           | SRS §7, Instr §37                        | Not implemented | **Critical** | Same.                                                                                                                                                                       |
| Per-source licence / redistribution status                                        | Q3 §51, SRS §39/§81                      | Not implemented | **High**     | Gates what the public API and exports may legally serve. Must exist _before_ first ingest, not after.                                                                       |

### B.2 Correction workflow & governance

| Requirement                                                                              | Ref                           | Status          | Lock-in risk | Note                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------- | --------------- | ------------ | --------------------------------------------------------------------------------- |
| Shudh Roop selection (word / multi-word / range / line / verse)                          | Q1 §E, Q3 §39/§40, SRS §23–25 | Not implemented | High         | Requires stored token offsets; drives the text model.                             |
| Aggregation by Bani + location + proposed change, retaining every reporter, one issue ID | Q3 §41, SRS §27               | Not implemented | High         | Aggregation key must be a first-class schema concept, not a query-time heuristic. |
| Conflicting proposals inside one investigation; accepting one auto-rejects the others    | Q3 §42, SRS §28               | Not implemented | High         | —                                                                                 |
| Two independent approvals, two distinct accounts, Editor/Super Admin only                | Q2 §18, SRS §32, Instr §7     | Not implemented | **Critical** | Must be a database constraint, not application logic (Instr §33).                 |
| Reviewer may propose but never publish                                                   | Q3 §43, SRS §31               | Not implemented | Critical     | —                                                                                 |
| Evidence repository with hashes, visibility tiers, existence-without-artifact disclosure | Q2 §16, SRS §34               | Not implemented | Medium       | —                                                                                 |
| Locked Bani; only Super Admin unlocks; personal edits still allowed                      | Q3 §45, SRS §36               | Not implemented | Medium       | —                                                                                 |
| Append-only audit of every decision                                                      | Q3 §53, SRS §64, Instr §33    | Not implemented | **Critical** | Retrofitted audit logs have a hole where the early history should be.             |
| Rejected corrections retained and shown contextually for learning                        | Q1 §F, Q2 §16                 | Not implemented | Medium       | —                                                                                 |

### B.3 Reader, offline, privacy

| Requirement                                                                          | Ref                                    | Status          | Lock-in risk | Note                                                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------------- | --------------- | ------------ | -------------------------------------------------------------------------------------- |
| Offline-first PWA, **selective** per-Bani download                                   | Q2 §25, SRS §21, Instr §12             | Not implemented | High         | Sync unit and content addressing must be designed up front.                            |
| Offline correction queue with Pending/Submitted/Synced/Failed                        | Q2 §26, SRS §22                        | Not implemented | Medium       | —                                                                                      |
| Personal local edits, never canonical, 3-way view (Accepted / Mine / Diff)           | Q2 §27, SRS §37, Instr §13             | Not implemented | High         | Storage location decision (client-only vs server) is a privacy decision.               |
| True Larivaar (not CSS space-hiding) + Pad Ched                                      | Q2 §6, SRS §12                         | Not implemented | High         | Only possible if word boundaries are stored as data.                                   |
| Zero analytics / zero behavioural collection / no fingerprinting                     | Q3 §52, SRS P-05/§63, Principles 11–12 | Not implemented | Medium       | Easy to honour if never introduced; hard to claim credibly once a dependency is added. |
| Anonymous ID `Anon-######` not derived from IP/fingerprint                           | Q2 §12, SRS §26, Instr §10             | Not implemented | High         | —                                                                                      |
| Username+password only, no email/OAuth; 3 security questions, hashed                 | Q1 §H, Q2 §13/§20, Q3 §54, SRS §38–40  | Not implemented | Medium       | —                                                                                      |
| MFA for Editor and Super Admin (TOTP; no hardware keys)                              | Q2 §20, SRS §40                        | Not implemented | Medium       | —                                                                                      |
| CAPTCHA/rate limiting honouring privacy (2 levels anon, 1 registered)                | Q1 §E, Instr §10                       | Not implemented | Medium       | Rules out third-party CAPTCHA services — see C.8.                                      |
| Themes (10–12), full typography controls, accessibility, TV/phone/desktop responsive | Q1 §C/§D, Q3 §56, SRS §49–51           | Not implemented | Low          | Additive, but design tokens should exist early.                                        |
| Fonts: only redistributable, properly licensed                                       | Q3 §51, SRS §48                        | Not implemented | Low          | Licence audit required per font before bundling.                                       |

### B.4 Research, API, community

| Requirement                                                                                                                           | Ref                                | Status          | Lock-in risk | Note                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------- | ------------ | ------------------------------------------------------------------------ |
| Source comparison / Variance Explorer with char / matra / bindi-tippi / punctuation / whitespace / word-boundary / line-break filters | Q2 §4, Q3 §37, SRS §9              | Not implemented | High         | Diff classification taxonomy must match these filter categories exactly. |
| Cross-source alignment with confidence, human-correctable, never auto-modifying canonical                                             | Q3 §38, SRS §10                    | Not implemented | High         | —                                                                        |
| Public API **read-only**, versioned, OpenAPI                                                                                          | Q2 §29, SRS §42/§80, Principle 9   | Not implemented | High         | Read-only should be enforced by database grants, not only by routing.    |
| Separate non-public administrative API                                                                                                | Q2 §29, SRS §43                    | Not implemented | High         | —                                                                        |
| Export: JSON / CSV / SQLite snapshot                                                                                                  | Q2 §28, SRS §44                    | Not implemented | Low          | —                                                                        |
| Search incl. first-letter (STTM/BaniDB style), Unicode-aware, metadata filters                                                        | Q1 §G, SRS §45/§72                 | Not implemented | Medium       | First-letter search needs a precomputed index column.                    |
| Audio: Paath/Santhia/Kirtan, manual line sync, YouTube as external reference only                                                     | Q2 §22/§23, Q3 §49/§50, SRS §54–57 | Not implemented | Low          | Deliberately deferrable; see §F.                                         |
| Forum (7 categories) + discussion attached to correction issues                                                                       | Q3 §46, SRS §58–60                 | Not implemented | Low          | —                                                                        |
| Events calendar, invitation-style banners, Editor/Super Admin publish only                                                            | Q3 §48, SRS §61                    | Not implemented | Low          | —                                                                        |
| Opt-in leaderboard, usernames only, no weighted scoring                                                                               | Q1 §E, Q2 §14, SRS §62             | Not implemented | Low          | —                                                                        |
| Backups, corpus export, restorable on another host, no vendor lock-in                                                                 | Q2 §31, SRS §82/§83                | Not implemented | Medium       | —                                                                        |

### B.5 Requirements the SRS silently dropped

Instruction §1 forbids silently removing requirements. Three items were answered in the questionnaires but do not appear in SRS v1.0. They are recorded here so they are not lost:

1. **Named, shareable settings profiles.** Q1 §D asks for settings saved online under a _setting name_, optionally password-protected, syncable by anyone who knows the name, with a quick-select list — explicitly _without_ requiring a user profile. SRS §49/§50 cover settings but not the shareable named-profile mechanism. _Recommendation: keep it, schedule in the reader phase, and treat a settings profile as an anonymous named object with an optional edit password — it fits the privacy model well._
2. **Hindi / English / Urdu font options.** Q1 §D asks for ~3 popular fonts each for Hindi, English and Urdu in addition to 7–10 Gurmukhi fonts. SRS §48 specifies only Gurmukhi. _Recommendation: keep it; translation/transliteration panes need their own font choices anyway._
3. **Reading-history-driven features vs. no-tracking.** Q1 §C asks for reading history and "recently read"; Q3 §52 forbids recording anything automatically. These are compatible only if history is **device-local and never transmitted**. _Recommendation: reading history, recently-read and resume position live exclusively in IndexedDB and are never sent to the server. This is recorded as a resolved conflict, not an open one._

### B.6 Requirement conflicts and their resolutions

Resolved using the principle order in Instruction §1 (corpus integrity > privacy > security > provenance > human verification > … > convenience). Original requirements are preserved; none are weakened.

| #   | Conflict                                                                                                                                                                                       | Resolution                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | Q1 §I: "admins should be able to edit the Bani directly, rather than only accepting submitted corrections" **vs** Principles 4/5 and SRS §32 (canonical change needs two independent reviews). | Editors _may_ originate a change without waiting for a user report, but the change is modelled as an **editor-initiated correction issue** that traverses the identical two-approval, evidenced, audited path. "Direct edit" means _direct origination_, never _direct mutation_. Corpus integrity outranks convenience.     |
| C-2 | Q1 §E/§F: five user-facing statuses **vs** Q2 §17: "I don't think any statuses are required… keep it simple".                                                                                  | Keep the five explicit statuses (Submitted / Under Review / Accepted / Rejected / Duplicate) from Q1 and SRS §29; they are the superset and the later answer expressed a preference against _internal workflow states_ leaking to users, which the internal/external state mapping (Q3 §44) already solves.                  |
| C-3 | Q2 §16: "for rejected or duplicate we really don't need to show anything" **vs** Q1 §F and Q3 §45: rejected history should be visible so the Sangat can learn.                                 | Rejected and duplicate outcomes are **not publicly browsable** and are **never attributed to a reporter**, but they _are_ surfaced **contextually** — when a user attempts a correction at a location with prior history, and on the lock-explanation screen. Both requirements are honoured.                                |
| C-4 | Q1 §E: two-level verification for anonymous reporting **vs** Principle 12 / Q3 §52: no fingerprinting, no third-party tracking.                                                                | Rules out reCAPTCHA/hCaptcha (third-party, tracking-adjacent). Use a **self-hosted proof-of-work challenge** (Altcha or mCaptcha class, both open source) as level 1 and an explicit **review-and-confirm submission step** as level 2, plus server-side rate limiting on coarse buckets with no raw-IP retention (see C.8). |
| C-5 | Audio in v1 (Q2 §22) **vs** zero-cost hosting (Q2 §31) **vs** no copyrighted-content copying (Q3 §49).                                                                                         | v1 audio is **reference + synchronisation metadata only**: external links plus manually authored timing points. Storage of actual audio files is limited to material with explicit permission and is deferred until hosting budget exists. This is already the SRS position (§56) and is reaffirmed.                         |
| C-6 | Q3 §34: ingest the entire corpus (SGGS + Dasam + Sarbloh + Nitnem + Rehatnamas + associated literature) from the start — _and you explicitly asked to be challenged on this_.                  | **Challenged — see C.1 below.** Short form: ingest everything into the **source layer** immediately (cheap, and provenance can never be backfilled), but **promote to the accepted layer incrementally**, starting with Nitnem. The requirement is preserved in full; only the _verification_ sequence is staged.            |

---

## C. Recommended Target Architecture

The SRS's proposed stack (React + TypeScript + Vite PWA; TypeScript/Fastify backend; PostgreSQL; Python ingestion tooling; object storage; job queue) is sound and I endorse it. What follows is the reasoning where it matters, plus **four places where I recommend deviating from or sharpening the SRS**, as Instruction §28 requires.

### C.1 Challenge — corpus scope: ingest everything, verify incrementally

You asked in Q3 §34 to be challenged if the "ingest everything from day one" position was wrong. It is **half right**, and the half that is wrong will hurt.

Your reasoning was about **storage**, and on storage you are correct: a full-corpus text source is on the order of 10⁵ words and 10⁶ Unicode codepoints — tens of megabytes even across several sources and snapshots. Storage is a non-issue.

The binding constraint is not bytes, it is **human verification throughput**. Every source you ingest multiplies the number of pairwise variance findings the comparison engine produces. Across several full-corpus sources, the engine will legitimately surface **six figures of differences** — most of them matra, bindi/tippi and punctuation variants, every one of which, by Principle 5, requires a human decision and, by SRS §32, _two_ of them from distinct eligible accounts. A very small non-profit team facing a review queue that large does not get a research platform; it gets an unreviewable backlog, and the temptation that follows is to bulk-accept one source as authoritative — which is exactly the failure mode Principle 4 exists to prevent.

**Recommendation (preserves the requirement in full, changes only sequencing):**

- **Source layer: ingest everything from day one.** Provenance, hashes, sync dates and licence status cannot be reconstructed later, and the comparison corpus is more valuable the more complete it is. This is the part of your instinct that is right, and it should be acted on early.
- **Accepted layer: promote incrementally.** Start with Nitnem, then Rehat-related and commonly recited Banian, then the Granths. Verification capacity, not ambition, sets the pace.
- **Make verification state first-class and visible.** Every Bani carries a state — `SOURCE_ONLY` / `IN_VERIFICATION` / `VERIFIED` / `LOCKED` — shown honestly in the reader. A reader must never be unable to tell whether the text in front of them has been through the project's process. Instruction §51 forbids presenting scaffolded work as complete; this is the corpus-level expression of that rule.
- **Never display unverified source text as though it were accepted corpus.** If only source-layer text exists for a Bani, either show it with an unambiguous provenance banner naming the source, or do not show it. Principle 16 and Instruction §52 both point here.

This gives you the comprehensive corpus you want, on a schedule the team can actually sustain, without weakening a single stated requirement.

### C.2 Challenge — do not create a `characters` table

SRS §66 lists `characters` among the minimum tables, and SRS §5 requires addressability "at the smallest practical level". A literal row-per-codepoint table is the wrong way to satisfy that, for three reasons:

1. **Scale.** ~10⁶ codepoints per full-corpus source × several sources × snapshots per source × accepted versions ⇒ **tens of millions to low hundreds of millions of rows** carrying almost no information each. Every ingest becomes a bulk-insert of millions of rows; every diff becomes a join across them.
2. **Correctness.** Gurmukhi graphemes are _clusters_ — a base consonant plus matras, bindi, tippi, addak, visarg. One row per codepoint fragments the cluster and invites code that treats a combining mark as an independent unit, which is precisely how "helpful" normalisation bugs enter. The unit that matters for a human reviewer is the grapheme cluster, not the codepoint.
3. **It is not needed.** Character-level addressing is fully achieved by **stable line identity plus codepoint offsets**.

**Recommendation:** persist text at **line** granularity as an exact immutable blob, persist **word boundaries as offset ranges** into that blob, and address characters as `(line_id, codepoint_start, codepoint_end)`. Grapheme-cluster segmentation is computed deterministically at read time by a single shared, versioned library. This satisfies every stated comparison requirement — character, combining mark, matra, bindi/tippi, punctuation, whitespace, word boundary, line break — at a fraction of the cost, and it keeps the grapheme rules in one testable place instead of implicit in a table's row structure.

_The requirement (character-level addressability and comparison) is preserved exactly; only the storage representation differs from the SRS's illustrative table list._

### C.3 Challenge — Postgres-backed job queue, not Redis

SRS §68 shows a generic "Job Queue". Introducing Redis adds a second stateful service, a second backup/restore path, a second thing to host at $0, and a class of bug where a job commits but its database transaction does not.

**Recommendation:** use a **PostgreSQL-backed queue** (`pg-boss` or `graphile-worker` class). Jobs enqueue _inside the same transaction_ as the data change that triggers them, which for an ingestion pipeline with strict provenance requirements is a correctness property, not a convenience. One database to back up, one to restore, one to host. Redis remains addable later behind the same queue interface if volume ever demands it.

### C.4 Challenge — enforce "public API is read-only" at the database, not in code

Principle 9 and SRS §42 make the public API read-only. Routing-level enforcement is one careless handler away from violation.

**Recommendation:** the public API process connects to PostgreSQL as a **dedicated role with `SELECT` only**, and only on an explicit set of public-facing views. `INSERT`/`UPDATE`/`DELETE` are not granted, so a write is impossible even if application code attempts one. The administrative API uses a separate role on a separate connection with separate credentials. This is defence in depth of the cheapest possible kind, and it makes the read-only guarantee auditable by inspecting grants rather than by reading every route.

The same technique carries the licensing gate: public views filter on `sources.redistribution`, so source text the project may not legally redistribute is _structurally_ unable to reach a public endpoint.

### C.5 Recommended stack

| Layer                        | Choice                                                                                                                   | Reasoning against SRS §24 priorities (security → maintainability → licensing → maturity → performance → PWA → DX)                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reader / Admin UI            | **React 19 + TypeScript + Vite**, PWA via Workbox, Dexie over IndexedDB                                                  | SRS §69. Mature, MIT/BSD-licensed, best-in-class PWA and offline tooling. Admin is a separate build sharing a component package — never bundled into the reader.                                                         |
| Backend API                  | **Fastify + TypeScript**, Zod schemas generating the OpenAPI document                                                    | SRS §70. Schema-first means validation, types and published API docs come from one definition, which removes the "docs drifted from reality" failure.                                                                    |
| Database                     | **PostgreSQL 17**                                                                                                        | Mandated by the domain: transactions, CHECK/EXCLUDE constraints, triggers, `bytea`, `pg_trgm`, JSONB, per-role grants. The invariants in §E genuinely need a database that can enforce them.                             |
| Migrations                   | Plain versioned **SQL** migrations, forward + reverse, run by a small runner                                             | Instruction §47. Hand-written SQL, not ORM auto-generation — the constraints and triggers here are the product, and they must be reviewable in the diff.                                                                 |
| Query layer                  | **Kysely** (typed query builder)                                                                                         | Types without an ORM's habit of hiding DDL. Keeps SQL visible.                                                                                                                                                           |
| Jobs                         | **Postgres-backed queue** in the same TypeScript service family                                                          | C.3                                                                                                                                                                                                                      |
| Object storage               | **S3-compatible API** (MinIO self-hosted; any S3 provider in production)                                                 | Evidence, audio, exports, snapshots. Only the S3 wire protocol is depended on — no provider SDK beyond that.                                                                                                             |
| Ingestion / research tooling | **Python 3.12** (`uv`), separate subproject                                                                              | SRS §70. Python's Unicode, `regex` (grapheme/property support), and diff/alignment ecosystem are materially better for this work. Deliberately _not_ on the request path — it produces review packages, never publishes. |
| Shared domain logic          | `packages/gurmukhi` (TypeScript) with a **Python port validated against shared golden fixtures**                         | Instruction §23 forbids duplicating business rules. Two runtimes genuinely need tokenisation and diff classification; the defence is one specification, one fixture set, both implementations tested against it in CI.   |
| Auth                         | Argon2id passwords; TOTP (RFC 6238) MFA for Editor/Super Admin; server-side sessions with rotating opaque refresh tokens | SRS §39–41. Opaque server-side sessions rather than self-contained JWTs: revocation actually works, and Instruction §8's "never trust unvalidated JWT claims" becomes structural.                                        |
| Anti-abuse                   | Self-hosted proof-of-work challenge + coarse rate limiting, no raw IP retention                                          | C-4, C.8                                                                                                                                                                                                                 |
| Deployment                   | **Docker Compose** as the canonical topology                                                                             | Instruction §48. See C.7.                                                                                                                                                                                                |

### C.6 System topology

```text
                    ┌──────────────────────────────────────────┐
                    │  Pothi Sahib PWA (React, offline-first)   │
                    │  IndexedDB: bani bundles, pothis,         │
                    │  bookmarks, settings, personal edits,     │
                    │  pending corrections, reading history     │
                    └───────┬──────────────────────┬────────────┘
                            │ read-only            │ authenticated
                            ▼                      ▼
                 ┌────────────────────┐   ┌────────────────────┐
                 │  Public API (v1)    │   │  Account/Report API │
                 │  DB role: SELECT    │   │  DB role: scoped    │
                 │  only, public views │   │  writes             │
                 └─────────┬──────────┘   └─────────┬──────────┘
                           │                        │
                           └────────┬───────────────┘
                                    ▼
                          ┌──────────────────┐        ┌──────────────────┐
                          │   PostgreSQL     │◀──────▶│  Worker (queue    │
                          │   (canonical)    │        │  in Postgres)     │
                          └────────┬─────────┘        └─────────┬────────┘
                                   │                            │
                                   ▼                            ▼
                          ┌──────────────────┐        ┌──────────────────┐
                          │ S3-compatible    │        │ Python ingestion  │
                          │ object storage   │        │ + comparison      │
                          │ evidence/audio/  │        │ (produces review   │
                          │ snapshots/export │        │  packages only)    │
                          └──────────────────┘        └─────────┬────────┘
                                                                │
      ┌──────────────────────┐                                  │
      │ Admin SPA (separate   │──▶ Admin API ─────────────────▶ │
      │ build, never bundled  │    DB role: privileged writes,   │
      │ with the reader)      │    2-approval enforced in DB     │
      └──────────────────────┘
```

Two invariants this topology exists to guarantee: **no path exists from the public API to a write**, and **no path exists from the ingestion pipeline to the accepted corpus** except through a human decision recorded in the database.

### C.7 Hosting, $0 tier, and vendor independence

The requirement is zero cost now (Q2 §31) with migration to paid or self-hosted infrastructure later, and no lock-in (SRS §82).

Free tiers change constantly, so the architecture must not encode any of them. The durable rule is: **depend only on the PostgreSQL wire protocol, the S3 object API, and HTTP.** No proprietary auth service, no vendor function runtime, no vendor queue, no vendor-specific database extension outside core Postgres and `pg_trgm`.

- **Canonical deployment** is `docker compose up` — Postgres, API, admin API, worker, MinIO, reverse proxy — which runs identically on a laptop, a VPS, or a Raspberry Pi. This, not the free tier, is the deployment the documentation describes and CI tests.
- **The $0 pilot** is then a _mapping_ of that topology onto whatever free tiers are current at launch: static hosting for the PWA (it is a static bundle), a container host for the two API processes and the worker, a free managed Postgres, and an S3-compatible free tier for objects. Because nothing above the three protocols is assumed, changing any of these is a configuration change.
- **Disaster recovery** (SRS §83): nightly `pg_dump` plus corpus/source-registry/correction-history exports written to object storage _and_ retrievable as a single downloadable archive, with a documented and **periodically rehearsed** restore into a clean Compose stack. An untested restore procedure is not a restore procedure.

### C.8 Privacy architecture

Privacy is a zero-compromise requirement, so it is designed rather than promised:

- **No analytics dependency is ever added.** Enforced mechanically: a CI dependency-allowlist check fails the build on any package matching known analytics/ads/fingerprinting/telemetry vendors, and a Content-Security-Policy with no third-party origins makes a tracking pixel structurally impossible.
- **No raw IP is stored.** Rate limiting and abuse detection use an **HMAC of the IP with a key that rotates daily and is never persisted**, held in a short-TTL store. This makes coarse abuse control possible while making retrospective user profiling impossible, satisfying both Q3 §52 and Q3 §53. Retention is documented in `docs/privacy.md`.
- **Anonymous identities are random, never derived.** `Anon-######` is generated with a CSPRNG server-side; the client keeps a claim secret so the reporter can check status. The server stores only a hash of that secret. No IP, fingerprint, device or location input participates in generation (Instruction §10).
- **Reading behaviour never leaves the device.** History, recently-read, resume position, favourites and bookmarks live only in IndexedDB. The server has no table for them. This is how B.5 item 3 is resolved.
- **Personal local edits stay client-side by default.** The server holds no divergent Gurbani attributable to an individual. If cross-device sync is requested later, it should be end-to-end encrypted and opt-in — but it is not in v1 and the absence is a feature.
- **Corpus analytics are derived from corpus and correction records only** — counts of Banis, lines, sources, issues, decisions, ages. Never from reader activity (SRS §77).

### C.9 The Unicode preservation mechanism

This is the project's single highest-priority requirement, so the mechanism is stated explicitly rather than left to good intentions.

The danger is not malice; it is that **normalisation is the default behaviour of many layers**. JavaScript's `String.prototype.normalize`, some ICU collations, several HTTP/JSON tool-chains, database collations, text editors and font shaping engines all silently alter or compare-as-equal Gurmukhi sequences that differ. A single `.normalize('NFC')` anywhere in the pipeline permanently destroys the distinction between two source readings — which is the exact thing this corpus exists to record.

Defences, layered:

1. **Store the exact octets.** Every distinct piece of text is stored once in a content-addressed blob table holding the original UTF-8 as `bytea`, together with its SHA-256. `bytea` cannot be normalised by a collation because it is not text to the database. A parallel `text` column exists for querying, but the `bytea` is definitive and the recovery test compares against it.
2. **Compare with `COLLATE "C"`** wherever source text equality matters, so no locale-aware collation can declare two different sequences equal.
3. **Ban normalisation in code.** A lint rule forbids `String.prototype.normalize` and `unicodedata.normalize` outside the single, explicitly named normalisation module that produces the _separate_ comparison representation (Principle 3, SRS §6.2). That module writes only to `source_normalizations` and can never write to a source or accepted blob.
4. **Prove recoverability continuously.** A CI test takes a fixture set of adversarial Gurmukhi strings — differing only in matra, bindi vs tippi, visarg, addak, combining-mark order, ZWJ/ZWNJ, whitespace and punctuation — pushes each through the full round trip _ingest → Postgres → API JSON → IndexedDB → reader render path → export_ and asserts **byte identity with the original** at the end. Instruction §30 requires the original always be recoverable; this test is what makes that claim true rather than aspirational, and it is why Milestone 1 exists.
5. **Fixtures are synthetic and labelled.** Per Instruction §52, Unicode test fixtures are clearly marked test data and are never seeded into the corpus.

---

## D. Proposed Repository Structure

A single repository (SRS §84 makes GitHub the source of truth), organised as a **pnpm workspace monorepo** with a Python subproject. Responsibilities are separated exactly as Instruction §23 requires; the layout below refines SRS §84 rather than replacing it.

```text
pothisahib/
├── apps/
│   ├── reader/                  # Pothi Sahib PWA — React + Vite + Workbox
│   │   ├── src/
│   │   │   ├── reader/          # text rendering, Pad Ched, Larivaar, auto-scroll
│   │   │   ├── shudh-roop/      # long-press / right-click selection + submission
│   │   │   ├── pothi/           # personal Pothi Sahib builder
│   │   │   ├── library/         # browse, categories, collections
│   │   │   ├── search/
│   │   │   ├── settings/        # typography, themes, named shareable profiles
│   │   │   ├── offline/         # Dexie schema, bundle sync, pending-report queue
│   │   │   └── a11y/
│   │   └── public/fonts/        # only licence-cleared fonts; LICENSES.md alongside
│   └── admin/                   # separate build — never bundled into the reader
│       └── src/
│           ├── queue/           # correction task queue        (SRS §76 A)
│           ├── dashboard/       # analytics                    (SRS §76 B) — kept separate
│           ├── sources/         # source registry              (SRS §76 C)
│           ├── variance/        # Gurbani Variance Explorer    (SRS §76 D)
│           ├── corpus/          # structure + accepted versions(SRS §76 E)
│           ├── translations/    # translations/transliterations(SRS §76 F)
│           ├── audio/           # audio + manual line sync     (SRS §76 G)
│           ├── users/           # users and roles              (SRS §76 H)
│           ├── forum/           # moderation                   (SRS §76 I)
│           ├── events/          #                              (SRS §76 J)
│           ├── audit/           # audit history                (SRS §76 K)
│           └── io/              # import / export              (SRS §76 L)
│
├── packages/
│   ├── gurmukhi/                # ⚑ the integrity core — no dependencies on app code
│   │   ├── src/
│   │   │   ├── codepoints.ts    # Gurmukhi block classification
│   │   │   ├── graphemes.ts     # cluster segmentation (base + matra + bindi/tippi/…)
│   │   │   ├── tokenize.ts      # word boundaries as codepoint offset ranges
│   │   │   ├── classify-diff.ts # CHAR|MATRA|BINDI_TIPPI|VISARG|PUNCT|WHITESPACE|
│   │   │   │                    # WORD_BOUNDARY|LINE_BREAK|STRUCTURAL
│   │   │   ├── normalize.ts     # ⚠ ONLY sanctioned normalisation site
│   │   │   └── first-letters.ts # first-letter search key derivation
│   │   └── fixtures/            # shared golden fixtures (also consumed by Python)
│   ├── domain/                  # state machines, permission matrix, validation schemas
│   ├── api-client/              # generated from OpenAPI — never hand-written
│   └── ui/                      # design tokens, themes, accessible primitives
│
├── services/
│   ├── api-public/              # read-only. DB role with SELECT on public views only
│   ├── api-admin/               # authenticated, privileged, not publicly routed
│   └── worker/                  # Postgres-backed queue consumers
│
├── corpus/
│   ├── migrations/              # numbered forward/reverse SQL — the schema is the product
│   ├── seeds/                   # reference data ONLY (roles, categories) — never Gurbani
│   └── docs/                    # ERD, invariants, corpus model
│
├── ingestion/                   # Python 3.12 (uv) — produces review packages, never publishes
│   ├── sources/                 # one adapter per registered source
│   ├── parsers/
│   ├── normalizers/
│   ├── alignment/
│   ├── comparison/
│   ├── gurmukhi_py/             # port of packages/gurmukhi, tested against shared fixtures
│   └── cli/                     # ingest snapshot | parse | align | compare | report
│
├── deployment/
│   ├── docker-compose.yml       # canonical topology
│   ├── docker-compose.dev.yml
│   ├── Dockerfile.*
│   └── backup/                  # dump, export, restore, rehearsal scripts
│
├── docs/
│   ├── PROJECT_PRINCIPLES.md    # ⚑ the 16 non-negotiables — required by instructions §3
│   ├── ARCHITECTURE_ASSESSMENT.md   # this document
│   ├── architecture.md   database.md   corpus-model.md
│   ├── source-ingestion.md   correction-workflow.md
│   ├── api.md   security.md   privacy.md   deployment.md
│   ├── backup-restore.md   contributing.md
│   ├── licensing.md             # software licence
│   ├── corpus-licensing.md      # data licence — deliberately a separate document
│   ├── data-stewardship.md      # SRS §65
│   └── fonts.md                 # per-font licence evidence
│
├── tests/
│   ├── unicode/                 # ⚑ round-trip recoverability — the gate on everything
│   ├── security/                # per-endpoint × per-role allow/deny matrix
│   ├── offline/                 # sync, queueing, conflict handling
│   └── e2e/                     # Playwright, incl. phone/tablet/desktop/TV viewports
│
├── scripts/
├── .github/workflows/           # ci.yml, security.yml, dependency-allowlist.yml
├── .env.example
├── LICENSE
└── README.md
```

Two structural rules worth stating because they are easy to erode:

- **`packages/gurmukhi` depends on nothing else in the repo.** It is the integrity core; keeping it dependency-free is what makes it exhaustively testable and safe to port to Python.
- **`apps/admin` is a separate build artefact.** Privileged UI must never ship in the reader bundle, even behind a flag — Instruction §8 forbids trusting hidden UI controls, and not shipping the code at all is stronger than hiding it.

---

## E. Proposed Database Architecture

PostgreSQL. The organising idea is **content-addressed, immutable text** with **structure, provenance and decisions as separate, append-only layers**. Nothing that represents Gurbani is ever updated in place, anywhere.

### E.1 The text substrate

```sql
-- Every distinct piece of text in the system, stored exactly once, byte-exact.
CREATE TABLE text_blobs (
    id              bigserial PRIMARY KEY,
    sha256          bytea NOT NULL UNIQUE,      -- of raw_bytes
    raw_bytes       bytea NOT NULL,             -- ⚑ definitive; immune to collation/normalisation
    raw_text        text  NOT NULL,             -- convenience for querying only
    codepoint_count int   NOT NULL,
    grapheme_count  int   NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- Enforced immutability: a rule/trigger raises on UPDATE or DELETE.
-- Enforced integrity:   CHECK (raw_bytes = convert_to(raw_text, 'UTF8'))
```

Consequences worth naming:

- **Identity is the hash.** Two sources that agree on a line share one blob, so "do these sources differ here?" is answered by comparing two integers before any diff algorithm runs.
- **Immutability is structural**, not a convention someone might forget.
- **Word boundaries are data, not formatting**, which is what makes true Larivaar (SRS §12) possible rather than a CSS trick:

```sql
CREATE TABLE token_layouts (           -- a tokenisation of one blob by one tokeniser version
    id               bigserial PRIMARY KEY,
    blob_id          bigint NOT NULL REFERENCES text_blobs(id),
    tokenizer_version text  NOT NULL,
    UNIQUE (blob_id, tokenizer_version)
);
CREATE TABLE tokens (
    layout_id  bigint NOT NULL REFERENCES token_layouts(id),
    ordinal    int    NOT NULL,
    cp_start   int    NOT NULL,        -- codepoint offsets into the blob
    cp_end     int    NOT NULL,
    PRIMARY KEY (layout_id, ordinal),
    CHECK (cp_end > cp_start)
);
```

A word is addressed as `(line_id, token ordinal)`; a character range as `(line_id, cp_start, cp_end)`. This is how §C.2's replacement for a `characters` table delivers full character-level addressability.

### E.2 Corpus structure (the editorial spine — carries no text)

```text
corpora ─┬─ granths ─┬─ banis ─┬─ bani_aliases
         │           │         ├─ sections (self-referencing: Section→Pauri/Ashtpadi/Chaupai/…)
         │           │         │    └─ lines            -- structural identity only, no text
         │           │         ├─ bani_verification_state  -- SOURCE_ONLY|IN_VERIFICATION|VERIFIED|LOCKED
         │           │         └─ bani_locks (reason, decision, actor, evidence, released_at)
         └─ collections ── collection_items             -- Maryada/institution orderings; many-to-many
```

Separating structural identity from text is what allows a line's text to change across accepted versions while every correction, bookmark, alignment and audit entry that points at that line stays valid.

### E.3 Source layer — immutable, provenance-bearing

```sql
CREATE TABLE sources (
    id             bigserial PRIMARY KEY,
    name           text NOT NULL,
    url            text,
    source_type    text NOT NULL,   -- DATABASE|API|WEBSITE|HTML|PDF|IMAGE|MANUSCRIPT|
                                    -- PRINTED_BOOK|AUDIO|VIDEO|OTHER
    license        text,
    license_url    text,
    attribution    text,
    redistribution text NOT NULL DEFAULT 'UNKNOWN',   -- ⚑ gates public exposure
                   -- ALLOWED | ATTRIBUTION_REQUIRED | PROHIBITED | UNKNOWN
    publisher      text,
    import_method  text,
    status         text NOT NULL,
    last_checked   timestamptz,
    last_synced    timestamptz,
    notes          text
);

CREATE TABLE source_snapshots (      -- append-only
    id             bigserial PRIMARY KEY,
    source_id      bigint NOT NULL REFERENCES sources(id),
    fetched_at     timestamptz NOT NULL,
    sha256         bytea NOT NULL,   -- of the retrieved artefact
    byte_size      bigint NOT NULL,
    storage_key    text NOT NULL,    -- object storage
    source_version text,
    parser_version text,
    imported_at    timestamptz
);

CREATE TABLE source_lines (          -- append-only; the immutable parsed source text
    id             bigserial PRIMARY KEY,
    snapshot_id    bigint NOT NULL REFERENCES source_snapshots(id),
    document_id    bigint REFERENCES source_documents(id),
    ordinal        int    NOT NULL,
    blob_id        bigint NOT NULL REFERENCES text_blobs(id),
    locator        jsonb              -- ang/page/shabad/line as the source expressed it
);

CREATE TABLE source_normalizations (  -- the SEPARATE comparison representation (SRS §6.2)
    source_line_id     bigint NOT NULL REFERENCES source_lines(id),
    normalizer_version text   NOT NULL,
    normalized_blob_id bigint NOT NULL REFERENCES text_blobs(id),
    PRIMARY KEY (source_line_id, normalizer_version)
);
```

`sources`, being metadata, is updatable. `source_snapshots`, `source_lines` and `source_normalizations` reject `UPDATE` and `DELETE` by trigger. Normalisation output lands in its own table and can never be written to a source or accepted blob — Principle 2 and 3, enforced by grant and trigger rather than by discipline.

Retention follows Q2 §5 / Q3 §36 exactly: keep the **latest** snapshot content plus the **hash and sync date of every** snapshot ever taken. History of _what was seen when_ is preserved without storing every historical copy.

### E.4 Accepted layer — versioned, never overwritten

```sql
CREATE TABLE accepted_versions (
    id                bigserial PRIMARY KEY,
    bani_id           bigint NOT NULL REFERENCES banis(id),
    version_no        int    NOT NULL,
    status            text   NOT NULL,     -- DRAFT | PUBLISHED | SUPERSEDED
    decision_id       bigint REFERENCES correction_decisions(id),
    rolled_back_from  bigint REFERENCES accepted_versions(id),  -- rollback = new version
    created_by        bigint NOT NULL REFERENCES users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    rationale         text,
    UNIQUE (bani_id, version_no)
);

CREATE TABLE accepted_line_texts (
    accepted_version_id bigint NOT NULL REFERENCES accepted_versions(id),
    line_id             bigint NOT NULL REFERENCES lines(id),
    blob_id             bigint NOT NULL REFERENCES text_blobs(id),
    token_layout_id     bigint NOT NULL REFERENCES token_layouts(id),
    PRIMARY KEY (accepted_version_id, line_id)
);
```

There is no `words.text` column anywhere, which is SRS §67's requirement made structural. A correction cannot mutate text because no mutable text exists to mutate; it can only cause a new `accepted_versions` row. Rollback likewise creates a new version pointing at what it reverted — history is never destroyed (Principle 15).

### E.5 Alignment and comparison

```sql
alignments(id, source_line_id, line_id, method, confidence numeric,
           status /* AUTO_SUGGESTED|HUMAN_CONFIRMED|HUMAN_CORRECTED|REJECTED */,
           reviewed_by, reviewed_at)

diff_findings(id, line_id, accepted_version_id, source_line_id,
              kind /* CHAR|MATRA|BINDI_TIPPI|VISARG|PUNCT|WHITESPACE|
                      WORD_BOUNDARY|LINE_BREAK|STRUCTURAL */,
              cp_start, cp_end, status /* UNRESOLVED|REVIEWED|ACCEPTED|REJECTED */)
```

The `kind` enumeration deliberately mirrors the Variance Explorer filter list in Q3 §37 and SRS §9 one-for-one, so filters are indexed column predicates rather than post-hoc text analysis. Automatic alignment may write only to `alignments` and `diff_findings`; it has no grant on `accepted_*` (Principle 4, SRS §10).

### E.6 Correction workflow

```sql
-- One investigation per (bani, line, span). This IS the aggregation key (Q3 §41).
CREATE TABLE correction_issues (
    id              bigserial PRIMARY KEY,
    bani_id         bigint NOT NULL REFERENCES banis(id),
    line_id         bigint NOT NULL REFERENCES lines(id),
    token_start     int, token_end int,          -- word / multi-word / range selection
    cp_start        int, cp_end   int,
    original_blob_id bigint NOT NULL REFERENCES text_blobs(id),
    internal_state  text NOT NULL,   -- NEW|IN_REVIEW|RESEARCH|PROPOSED|SECOND_REVIEW|
                                     -- APPROVED|PUBLISHED|REJECTED|DUPLICATE|SUPERSEDED|LOCKED
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bani_id, line_id, token_start, token_end, cp_start, cp_end)
);

-- Identical proposals converge automatically; distinct proposals coexist in one issue (Q3 §42).
CREATE TABLE correction_proposals (
    id                bigserial PRIMARY KEY,
    issue_id          bigint NOT NULL REFERENCES correction_issues(id),
    proposed_blob_id  bigint NOT NULL REFERENCES text_blobs(id),
    outcome           text,          -- ACCEPTED | REJECTED | SUPERSEDED | NULL
    UNIQUE (issue_id, proposed_blob_id)
);

-- Every individual reporter is retained even though there is one investigation (Q3 §41).
CREATE TABLE correction_reports (
    id                bigserial PRIMARY KEY,
    issue_id          bigint NOT NULL REFERENCES correction_issues(id),
    proposal_id       bigint NOT NULL REFERENCES correction_proposals(id),
    reporter_user_id  bigint REFERENCES users(id),
    anon_identity_id  bigint REFERENCES anon_identities(id),
    reason            text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(reporter_user_id, anon_identity_id) = 1)
);

CREATE TABLE correction_reviews (
    id           bigserial PRIMARY KEY,
    issue_id     bigint NOT NULL REFERENCES correction_issues(id),
    proposal_id  bigint REFERENCES correction_proposals(id),
    actor_id     bigint NOT NULL REFERENCES users(id),
    actor_role   text   NOT NULL,   -- role AT TIME OF ACTION, captured not looked up
    action       text   NOT NULL,   -- RECOMMEND_ACCEPT|RECOMMEND_REJECT|APPROVE|REJECT
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE correction_decisions (
    id                   bigserial PRIMARY KEY,
    issue_id             bigint NOT NULL REFERENCES correction_issues(id),
    accepted_proposal_id bigint REFERENCES correction_proposals(id),
    approver_1           bigint NOT NULL REFERENCES users(id),
    approver_2           bigint NOT NULL REFERENCES users(id),
    decided_at           timestamptz NOT NULL DEFAULT now(),
    CHECK (approver_1 <> approver_2)        -- ⚑ two-person rule, in the schema
);
```

Supporting tables: `evidence` (kind, storage_key, sha256, licence, visibility `PUBLIC|REVIEWER|ADMIN`, submitted_by) and `issue_evidence`; `anon_identities(id, label 'Anon-483921', claim_token_hash, created_at)` with no device, IP or fingerprint column existing to be misused.

**Invariants enforced in the database, not in application code** (Instruction §33):

1. `text_blobs`, `source_snapshots`, `source_lines`, `accepted_*` and `audit_log` reject `UPDATE`/`DELETE`.
2. `CHECK (approver_1 <> approver_2)` — one account can never satisfy both review passes.
3. A trigger on `accepted_versions` transitioning to `PUBLISHED` verifies its `decision_id` exists and that both approvers held `EDITOR` or `SUPER_ADMIN` **at the time of their `APPROVE` action** — so a later role change cannot retroactively validate or invalidate a decision.
4. `UNIQUE (issue_id, proposed_blob_id)` makes duplicate-proposal aggregation automatic rather than a background job that might not run.
5. Accepting one proposal marks the siblings `REJECTED`/`SUPERSEDED` in the same transaction — the automatic resolution you asked for in Q3 §42.
6. Per-role grants: public API role `SELECT` on public views only; ingestion role has **no grant whatsoever** on `accepted_*`.

### E.7 Users, personal data, and the rest

```text
users(id, username citext UNIQUE, password_hash /*argon2id*/, leaderboard_opt_in, created_at)
   -- no email, phone, real name, DOB, location, or photo column exists
user_security_answers(user_id, idx, question_id, answer_hash)   -- hashed + salted, never plaintext
user_mfa(user_id, totp_secret_encrypted, confirmed_at)          -- required for EDITOR/SUPER_ADMIN
roles / user_roles / role_grants                                -- server-side permission matrix
sessions(id, user_id, refresh_token_hash, expires_at, revoked_at)

pothis(id, owner_user_id, name, visibility) / pothi_items(pothi_id, ordinal, bani_id)  -- duplicates OK
pothi_shares(pothi_id, code, revoked_at)                        -- read-only sharing

translations / transliterations(id, line_id, language, author, source, version,
                                attribution, license, blob_id)
audio_sources / audio_tracks / audio_sync_points(track_id, ms_offset, line_id)
forum_categories / forum_threads / forum_posts / forum_reports   -- threads may attach to an issue
events(...)
audit_log(id, ts, actor_type, actor_id, action, object_type, object_id,
          before jsonb, after jsonb, reason, issue_id)           -- append-only
security_events(...)                                             -- HMAC'd IP, short TTL, documented retention
```

**Deliberately absent from the server**: bookmarks, favourites, reading positions, reading history and personal edits. SRS §66 lists tables for several of these; they are omitted by design because Q3 §52 forbids collecting reader behaviour and these belong in IndexedDB. _This is a conscious, documented deviation from the SRS's table list made on privacy grounds — flagged for your decision rather than made silently._ If cross-device sync is later wanted, it should arrive as opt-in, end-to-end encrypted blobs the server cannot read.

---

## F. Proposed Implementation Phases

This follows SRS §91 with one change: SRS "Phase 0 — Foundation" and "Phase 1 — Corpus Engine" are **merged into Phase 1**, because a foundation without the text substrate cannot be tested for the thing that matters most, and a corpus engine without a foundation cannot be deployed. Everything else keeps the SRS's ordering.

Each phase is complete only against Instruction §49's Definition of Done — implementation, tests passing, security addressed, accessibility addressed, offline implications addressed, documentation updated, migrations present, API docs updated.

| Phase | Name                               | Delivers                                                                                                                                                                                                                                                                                   | Exit criteria                                                                                                                                                                                                                           |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Foundation + Corpus Spine**      | Monorepo, CI, Compose deployment, `.env.example`, licences, `docs/PROJECT_PRINCIPLES.md`; `packages/gurmukhi`; text substrate + source layer + audit migrations; Source Registry; snapshot ingestion CLI; auth + roles + permission matrix                                                 | **Unicode round-trip test passes end-to-end**; a real source snapshot is ingested, hashed and stored immutably with licence recorded; immutability triggers proven by test; role matrix tested for all four roles across every endpoint |
| **2** | **Accepted Corpus + Public API**   | Structure tables, accepted versions, version history, rollback-as-new-version; read-only public API v1 with OpenAPI; per-Bani content bundles; JSON/CSV/SQLite export                                                                                                                      | Two-approval trigger proven; rollback preserves history; public API role provably cannot write; licence gate provably filters non-redistributable sources                                                                               |
| **3** | **Reader / PWA**                   | Reader, Pad Ched, true Larivaar, typography, themes, fonts (licence-cleared), translations/transliterations, search incl. first-letter, bookmarks, favourites, Pothi Sahib, offline bundle download, auto-scroll, wake-lock, full-screen, accessibility                                    | SRS §86 acceptance criteria met; offline verified with network disabled; tested at phone/tablet/laptop/desktop/TV viewports; axe/keyboard/screen-reader pass                                                                            |
| **4** | **Correction System (Shudh Roop)** | Long-press/right-click selection, multi-word ranges, submission with evidence, anonymous + registered reporting, PoW challenge + rate limiting, aggregation, conflicting proposals, reviewer queue, two-pass approval, locking, personal local edits with 3-way view, offline report queue | SRS §88 acceptance criteria met; Reviewer provably cannot publish; same account provably cannot supply both approvals; aggregation and auto-reject of sibling proposals tested                                                          |
| **5** | **Source Research**                | Full ingestion pipeline for the remaining sources, normalisation, tokenisation, alignment with confidence, comparison, Variance Explorer with all filters, import/export of comparison datasets                                                                                            | Alignment provably cannot write to `accepted_*`; all seven filter categories functional; low-confidence alignments flagged for human review                                                                                             |
| **6** | **Audio**                          | Audio registry and metadata, YouTube-as-external-reference workflow, manual line synchronisation, playback with speed/loop/highlight, graceful "audio unavailable"                                                                                                                         | Sync points drive highlighting; no copyrighted media stored without recorded permission                                                                                                                                                 |
| **7** | **Community**                      | Forum (7 categories), discussions attached to correction issues, moderation with audit, events calendar with banner presentation, opt-in leaderboard                                                                                                                                       | Moderation actions audited; forum identity model matches the account model exactly                                                                                                                                                      |
| **8** | **Public Research Corpus**         | Public correction history (existence-of-evidence without artefacts), downloadable datasets, developer documentation, API changelog, statistics                                                                                                                                             | SRS §90 acceptance criteria met; rejected reports provably never expose reporter identity                                                                                                                                               |

Cross-cutting and continuous, not a phase: backup/restore rehearsal, dependency-licence audit, the privacy CI check, and the security test matrix — each grows with every phase rather than being bolted on at the end.

---

## G. Immediate Phase-1 Implementation Plan

Phase 1 is deliberately unglamorous. It produces no visible reader. What it produces is the set of guarantees that every later phase depends on and that cannot be retrofitted: **byte-exact preservation, provenance, immutability, versionable structure, and server-side authorisation.**

### G.1 Work breakdown

**1.1 Repository foundation**
`pnpm` workspace, TypeScript strict mode, ESLint + Prettier, Vitest, `.editorconfig`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, and `docs/PROJECT_PRINCIPLES.md` (required by the development instructions §3 — anyone cloning the repo must meet the non-negotiables before reading any code). CI on every push: typecheck, lint, unit tests, migration up/down, dependency-allowlist check.

**1.2 `packages/gurmukhi` — the integrity core**
Codepoint classification for the Gurmukhi block; grapheme-cluster segmentation; tokenisation producing codepoint offset ranges; diff classification into the eight `kind` categories; first-letter key derivation; and the single sanctioned `normalize.ts`. Property-based tests assert the central invariant: **for any input, `detokenize(tokenize(x)) === x` byte-for-byte, and no function outside `normalize.ts` ever alters a codepoint sequence.** A lint rule forbids `String.prototype.normalize` elsewhere in the repo.

**1.3 Migrations 0001–0005**
`0001` extensions and enums; `0002` `text_blobs` + `token_layouts` + `tokens` with immutability triggers and the `raw_bytes = convert_to(raw_text,'UTF8')` check; `0003` `sources`, `source_snapshots`, `source_documents`, `source_lines`, `source_normalizations` with append-only triggers; `0004` `users`, `roles`, `user_roles`, `user_security_answers`, `user_mfa`, `sessions`, `anon_identities`; `0005` `audit_log` and `security_events`, append-only, plus the per-role `GRANT`s that make the public role read-only. Every migration reversible and tested both directions in CI.

**1.4 Source Registry and snapshot ingestion**
`ingestion/cli`: `ingest snapshot --source <id> --input <path|url>` downloads or accepts an artefact, computes SHA-256, writes it to object storage, and records `source_snapshots`. It **stops there** — no parsing into the canonical corpus, no publication. Registering a source **requires** `license`, `license_url` and `redistribution` to be set; `UNKNOWN` redistribution blocks all public exposure. This is the point at which the licensing discipline in SRS §39/§81 becomes real rather than documented.

**1.5 Authentication and authorisation**
Argon2id passwords; up to three hashed, salted security answers; TOTP MFA enforced for `EDITOR` and `SUPER_ADMIN`; server-side sessions with rotating opaque refresh tokens; a central permission matrix in `packages/domain` consulted by every privileged route; login rate limiting and lockout with HMAC'd, short-TTL IP handling. Anonymous identity issuance via CSPRNG with a hashed claim token.

**1.6 Deployment**
`docker compose up` brings up Postgres, MinIO, the public API, the admin API and the worker, with health checks. Backup and restore scripts, plus a documented restore rehearsal.

**1.7 Tests — the gate on the whole phase**

- `tests/unicode/`: the adversarial Gurmukhi fixture set (matra pairs, bindi vs tippi, visarg, addak, combining-mark ordering, ZWJ/ZWNJ, whitespace, punctuation) pushed through **ingest → Postgres → API JSON → IndexedDB → export**, asserting byte identity at every hop. Fixtures are synthetic and labelled as test data.
- `tests/security/`: every implemented endpoint × {unauthenticated, USER, REVIEWER, EDITOR, SUPER_ADMIN}, asserting both permitted and forbidden outcomes; plus explicit role-escalation attempts.
- Immutability tests: `UPDATE`/`DELETE` against each protected table must raise.
- Migration up/down on a clean database.

### G.2 Recommended first implementation milestone

> **Milestone 1 — "Provable Unicode integrity and provenance."**
>
> A cloned repository that starts with `docker compose up`, applies migrations 0001–0005, ingests a real source artefact into an immutable, hashed, licence-recorded snapshot, and passes a CI suite proving that (a) an original Gurmukhi Unicode sequence survives the full round trip byte-for-byte, (b) protected tables reject mutation, (c) the public database role cannot write, and (d) the four roles behave correctly on every implemented endpoint.
>
> **Explicitly out of scope:** any reader UI, any accepted-corpus text, any parsing of source material into the canonical corpus, any correction workflow.

**Why this milestone and not something more visible.** Every other capability in this specification can be added later without penalty. These four cannot. Text ingested before the round-trip guarantee exists is permanently untrustworthy and must be re-ingested; a snapshot taken before provenance recording is a snapshot with no provenance, forever; an audit log started late has a hole exactly where the project's earliest and least-scrutinised decisions sit. Building the reader first would be more satisfying to demonstrate and would quietly compromise the project's stated first principle.

It is also small. It is a focused, testable unit of work with an unambiguous pass/fail signal — which is what Instruction §25's "smallest sensible implementation milestone" asks for.

**Definition of Done for Milestone 1:** CI green on all of the above; `docs/` contains architecture, database, corpus-model, source-ingestion, security, privacy and deployment pages reflecting what was actually built; `.env.example` complete; migrations reversible; no secret in Git history; `docs/PROJECT_PRINCIPLES.md` present.

---

## H. Decisions Needed From You

Only items that genuinely gate work are listed. Everything else has been decided using engineering judgment, as Instruction §27 directs.

| #   | Decision                                                                                                                                                                                    | Recommendation                                                                                                                                                                                                                                                    | Gates                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| D-1 | **Software licence** — SRS §81 says finalise before repository initialisation.                                                                                                              | **Apache-2.0.** Same permissiveness as MIT, plus an explicit patent grant and contribution terms — better suited to a long-lived community project that others will build on. Corpus licensing stays a separate document (`docs/corpus-licensing.md`).            | The first commit     |
| D-2 | **GitHub push access.** The token available to this session is not linked to a GitHub account, so I can read the repository but not push to it.                                             | Either connect your GitHub account to Claude, or provide a fine-grained personal access token with `contents: write` on `arvinderss/pothisahib`. Failing both, I can build the repository in full here and hand it to you to push.                                | Milestone 1 delivery |
| D-3 | **Application and corpus names.** Questionnaire 2 §32 asked for a shortlist and the SRS proposed one (§97/§98) but nothing was chosen.                                                      | Proceed with **Pothi Sahib** (application) and **Gurbani Kosh** (corpus) as working names, as the SRS assumes. Renaming later is cheap if package names stay neutral — but the public API path and dataset names are harder to change, so confirm before Phase 2. | Phase 2 (API paths)  |
| D-4 | **Server-side personal data (§E.7).** I have omitted bookmarks, favourites, reading positions and personal edits from the server on privacy grounds, deviating from the SRS §66 table list. | Keep them client-only for v1. Add opt-in, end-to-end-encrypted sync later if users ask. Flagged rather than decided silently.                                                                                                                                     | Phase 3              |

Two items are **not** blocking but need action before the relevant phase: a **licence audit of every candidate Gurmukhi font** before any font is bundled (Phase 3), and a **licence/redistribution review of each external source** before its data is exposed publicly (Phase 2). Neither should be assumed from public accessibility — SRS §81 is explicit, and the schema already enforces it via `sources.redistribution`.

---

## I. Summary

The repository is empty; there is nothing to preserve and nothing to rewrite. The requirements are unusually complete, and the decisive architectural commitment — **separating source, normalised and accepted text, and never collapsing them into one mutable field** — is already made and is correct.

Three recommendations depart from the SRS, each preserving the underlying requirement: ingest the whole corpus into the source layer immediately but promote to the accepted layer incrementally (C.1); replace a row-per-character table with content-addressed line blobs plus token offsets (C.2); and enforce read-only public access and the two-person rule through database grants and constraints rather than application code (C.4, E.6).

The first milestone should build none of the visible product. It should make the project's first principle — that an original Gurmukhi Unicode sequence is never altered and is always recoverable — a property the test suite proves on every commit, before a single line of Gurbani is stored.

---

## J. Addendum v1.1 (2026-09-16): environment verification and Milestone 1 outcome

This addendum records what changed between the assessment and the implementation, so the document stays honest.

### J.1 Inspection re-verified on the project owner's machine

| Item       | Finding                                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository | Files copied from the Cowork session (no `.git`); GitHub remote still empty. Git initialised locally on `main` at the end of Milestone 1.                                                                                  |
| Toolchain  | Only Git was installed. Node 24.21.0 LTS (SHA-256 verified) and pnpm 10.12.1 were installed to the user profile. No Docker, no PostgreSQL server, no Python.                                                               |
| Prior work | `packages/gurmukhi` (53 passing tests) and migrations 0001–0006 were sound and were kept. One latent defect in 0006 (role-audit trigger type) was found by the new tests and corrected before the first commit (ADR-0005). |

### J.2 Deviations from sections C–G, each recorded as an ADR

- **Ingestion in TypeScript, not Python** (ADR-0001): one implementation of the Unicode rules instead of two kept in lock-step.
- **PGlite for tests and development** (ADR-0002): real PostgreSQL semantics in-process; production and CI use PostgreSQL 17. This replaced the "Docker Compose first" assumption in G.1 because Docker was unavailable, and it removed a contributor barrier.
- **Approvals as independent actions** (ADR-0003): the two-person decision is materialised from two `version_approvals` rows rather than submitted as one row.
- **Own TOTP implementation** (ADR-0004).
- **Milestone scope widened vertically** (Rapid Delivery Mode instruction): Milestone 1 delivered the accepted layer, the public read-only API and an operator CLI in addition to G.2's substrate, provenance and authorisation, because a complete ingest → adopt → approve → publish → read workflow is more valuable than substrate alone and none of it was speculative.
- **Migration 0007** added parser provenance on `source_documents`, `version_approvals`, `blob_search_keys`, and the public `sections` and `search_lines` views.

### J.3 Milestone 1 result

Delivered and verified by 250 passing tests (see `HANDOVER.md` §3 and `docs/requirements-traceability.md`): byte-exact substrate, source registry with licence enforcement, immutable hashed snapshots, strict parsers, corpus spine, two-person versioned accepted text with rollback, accounts with MFA, audit, public read-only API, admin API, CLI. Unverified: Docker Compose topology, backup scripts, CI (nothing pushed). Not started: the reader and everything from Phase 3 onward.
