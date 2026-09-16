# API

Two separate HTTP services. Both publish an OpenAPI 3.1 document generated from their route
schemas, and interactive docs.

| Service | Base        | DB role                                       | Auth                            | Docs                                    |
| ------- | ----------- | --------------------------------------------- | ------------------------------- | --------------------------------------- |
| Public  | `/api/v1`   | `kosh_public` (SELECT on `public_api.*` only) | none                            | `/api/docs`, `/api/v1/openapi.json`     |
| Admin   | `/admin/v1` | `kosh_app`                                    | `Authorization: Bearer <token>` | `/admin/docs`, `/admin/v1/openapi.json` |

Errors are always `{ "error": { "code": string, "message": string } }` and never include stack
traces, SQL or paths. Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
no-referrer`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'` (API paths).

## Public API (read-only)

| Route                                                       | Returns                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                               | `{status:"ok"}`                                                                                                                                      |
| `GET /api/v1/banis`                                         | Banis with granth, `verificationState`, `publishedVersionNo`, `textAvailable`                                                                        |
| `GET /api/v1/banis/{slug}`                                  | Bani + section tree                                                                                                                                  |
| `GET /api/v1/banis/{slug}/lines`                            | Published accepted text, byte-exact, with `sha256`, `codepointCount`, `graphemeCount` and `tokens: [cpStart, cpEnd][]`                               |
| `GET /api/v1/banis/{slug}/versions`                         | Version history (published/superseded) with decision kind and rationale                                                                              |
| `GET /api/v1/banis/{slug}/versions/{n}/lines`               | Byte-exact text of one historical version (published or superseded; drafts never)                                                                    |
| `GET /api/v1/banis/{slug}/bundle`                           | Offline bundle `kosh-bundle/1`: lines + offsets + sections + lineage source + per-line and bundle SHA-256; `ETag` per version, `If-None-Match` → 304 |
| `GET /api/v1/sources`                                       | Source registry with licence and redistribution status                                                                                               |
| `GET /api/v1/sources/{slug}/snapshots`                      | Provenance: hash, size, fetch time, declared version of every snapshot                                                                               |
| `GET /api/v1/search?q=&first_letters=&bani=&limit=&offset=` | Published lines matching exact text / comparison form / first letters, with match offsets                                                            |
| `GET /api/v1/statistics`                                    | Counts derived from corpus and decision records only                                                                                                 |

Only PUBLISHED text whose lineage-root source is ALLOWED or ATTRIBUTION_REQUIRED is ever returned
(view-level gate). Responses carry `Cache-Control: public, max-age=300` and permissive CORS
(`PUBLIC_CORS_ORIGIN`). The route table contains only GET/HEAD; a test asserts it.

Bundle verification (client side, see `apps/reader/src/lib/bundle.ts`): `sha256(utf8(text)) == sha256` for every line, token offsets within `[0, codepointCount]` and non-overlapping, and `sha256(lineShas.join('\n')) == bundleSha256`. The reader stores and renders a bundle only after this passes, and re-verifies on every read.

Planned additions (later phases): translations, transliterations, correction history, downloadable datasets.

## Admin API (authenticated)

Roles: USER < REVIEWER < EDITOR < SUPER_ADMIN. `admin.read` needs REVIEWER; every mutation needs
EDITOR (plus an MFA-verified session); account/role management needs SUPER_ADMIN. The matrix is
`packages/domain/src/permissions.ts` and is tested for every endpoint × every role.

| Route                                                                                                                                                                                         | Min role    | Purpose                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `POST /auth/login`                                                                                                                                                                            | –           | username + password (+ `mfaCode` if enrolled) → opaque token (12 h) |
| `POST /auth/logout`, `GET /auth/me`                                                                                                                                                           | session     |                                                                     |
| `POST /auth/mfa/enroll`, `POST /auth/mfa/confirm`                                                                                                                                             | session     | TOTP enrolment; recovery codes returned once                        |
| `GET /sources`, `GET /sources/{slug}/snapshots`, `GET /snapshots/{id}/documents`, `GET /documents/{id}/lines`, `GET /banis`, `GET /banis/{slug}/versions`, `GET /versions/{id}`, `GET /audit` | REVIEWER    | read                                                                |
| `POST /sources`, `PATCH /sources/{slug}`                                                                                                                                                      | EDITOR      | registry and licence                                                |
| `POST /sources/{slug}/snapshots` (`contentBase64`)                                                                                                                                            | EDITOR      | ingest artefact                                                     |
| `POST /snapshots/{id}/parse` (`format`, optional `options.scope` / `options.banis` for `shabados-sqlite-v1`)                                                                                  | EDITOR      | parse                                                               |
| `POST /corpus/corpora`, `/corpus/granths`, `/corpus/banis`, `POST /banis/{slug}/structure/bootstrap`                                                                                          | EDITOR      | structure                                                           |
| `POST /banis/{slug}/versions/adopt`, `POST /banis/{slug}/versions/rollback`                                                                                                                   | EDITOR      | drafts                                                              |
| `POST /versions/{id}/approve`                                                                                                                                                                 | EDITOR      | independent approval (2nd distinct approver creates the decision)   |
| `POST /versions/{id}/publish`                                                                                                                                                                 | EDITOR      | explicit commit                                                     |
| `GET /users`, `POST /users`, `POST /users/{username}/roles`, `DELETE /users/{username}/roles/{role}`                                                                                          | SUPER_ADMIN | accounts and roles                                                  |

Login is rate-limited (10/min) and every account locks for 15 minutes after 5 failed attempts.
Unknown-user and wrong-password responses are identical. Tokens are random 256-bit values; only
their SHA-256 is stored, so logout and revocation are immediate. Roles are re-read from the
database on every request.
