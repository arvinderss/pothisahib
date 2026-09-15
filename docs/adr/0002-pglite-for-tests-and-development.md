# ADR 0002: PGlite (PostgreSQL in WebAssembly) for tests and zero-setup development

**Decision.** The test-suite and default local development run the project's unchanged SQL
migrations on PGlite in-process. Production and CI's reversibility job run the same migrations on
a PostgreSQL 17 server. The `Db` abstraction in `packages/db` wraps both drivers.

**Context.** The development machine for Milestone 1 had no Docker and no PostgreSQL. The
schema's guarantees are triggers, CHECKs and grants, so they must be tested on real PostgreSQL
semantics, not a mock. Contributors should be able to run the whole suite with `pnpm test` alone.

**Alternatives.** (a) Require Docker for tests. (b) SQLite (would lose bytea CHECKs with
`sha256()`, per-role grants, `SET ROLE`, plpgsql triggers). (c) PGlite.

**Reason.** PGlite is real PostgreSQL (18.x core) compiled to WASM, Apache-2.0, with `citext`
and `pg_trgm` available; every invariant the project relies on (bytea CHECK with `sha256()`,
`COLLATE "C"`, plpgsql triggers, `CREATE ROLE`/`GRANT`/`SET ROLE`) was probed and works. Tests
start in about a second with no services.

**Consequences.** A PGlite data directory is single-process: running both services and the CLI
against one development database requires a PostgreSQL server. Grant boundaries are exercised in
tests with `SET LOCAL ROLE` on the owner connection; production uses separate login roles and the
CI job proves migrations on a real server. Minor version drift between PGlite's core and the
server is mitigated by that CI job.
