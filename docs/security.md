# Security

## Model

- **Authorisation is server-side and layered.** The HTTP layer checks the permission matrix; kosh-core re-checks live grants for publish; the database enforces two-person decisions, role eligibility, MFA-before-grant and no self-grant; database roles cap what each process can touch at all.
- **Four roles**, one direction: USER < REVIEWER < EDITOR < SUPER_ADMIN. Grants are append-only rows with revocation; the effective role is the highest active grant, loaded fresh per request.
- **Two-person rule** for every change to accepted text: two distinct EDITOR/SUPER_ADMIN accounts, roles captured at approval time by trigger. A later role change cannot validate or invalidate a past decision.

## Authentication

- Passwords: Argon2id (m=19 MiB, t=2, p=1), 12–256 characters, never logged.
- MFA: TOTP (RFC 6238, SHA-1, 30 s, ±1 step) implemented on `node:crypto` and verified against the RFC vectors; secrets encrypted at rest with AES-256-GCM under `KOSH_MFA_KEY`; 8 one-time recovery codes stored hashed. Required for EDITOR and SUPER_ADMIN: the database refuses the grant until MFA is confirmed, and privileged actions require an MFA-verified session.
- Sessions: 256-bit random bearer tokens, SHA-256 stored, 12-hour expiry, revocable.
- Login protection: identical responses and a dummy Argon2 verification for unknown users (R-19); 5 failures in 15 minutes lock the account (recorded in `security_events` by user id only); in-memory per-process rate limit (10/min on login, 300/min globally). No IP is persisted.
- Recovery: security-question recovery (SRS §39) is scheduled for the reader phase and is **disabled by policy for privileged roles** (R-17); a privileged account is recovered by a Super Admin action plus MFA reset.

## Input handling

- Every request body and parameter is validated by JSON Schema with `additionalProperties: false`; ids match `^[0-9]{1,18}$`, slugs `^[a-z0-9][a-z0-9-]{1,79}$`.
- All SQL is parameterised. Enum values are validated against closed lists before use.
- Uploaded artefacts: base64 body limit 48 MB, decoded and hashed, stored under a key derived from the hash (no user-supplied file names, no path traversal possible), verified on read.
- Parsers reject invalid UTF-8, NUL, lone surrogates and unexpected JSON shapes rather than repairing them.
- Errors never leak stack traces, SQL or paths.

## Database roles (defence in depth)

| Role          | Can                                                                                                   | Cannot                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `kosh_public` | SELECT `public_api.*`                                                                                 | read any base table; write anything                 |
| `kosh_ingest` | write text substrate, source layer, search keys, audit; narrow UPDATE on `sources`/`source_snapshots` | read/write accepted text, decisions, identity       |
| `kosh_app`    | DML on public tables; DELETE on `sessions`, `security_events`                                         | DDL, TRUNCATE, DELETE elsewhere; bypass any trigger |

Tests: `corpus/test/invariants.test.ts` (grants, triggers), `services/api/test/security.test.ts`
(endpoint × role matrix, escalation, tokens, validation, read-only public API).

## Known gaps to close

- Anonymous reporting anti-abuse (self-hosted proof-of-work) arrives with Phase 4.
- The rate limiter is per-process memory; behind multiple replicas it is per replica.
- TLS termination is the reverse proxy's job; the admin API binds to loopback by default.
- Sock-puppet approvals cannot be prevented technically (R-14); transparency of privileged grants is the control.
