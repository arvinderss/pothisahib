# Privacy

Privacy is a zero-compromise requirement (Q3 §52, SRS P-05). This page states what the system
records and, more importantly, what it structurally cannot record.

## What is collected

| Data                                                                    | Where                             | Why                                          |
| ----------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Username, Argon2id password hash                                        | `users`                           | account (optional; reading needs no account) |
| Encrypted TOTP secret, hashed recovery codes                            | `user_mfa`                        | MFA for privileged roles                     |
| Role grants/revocations with grantor and reason                         | `user_roles`, `audit_log`         | governance                                   |
| Session token hashes and expiry                                         | `sessions`                        | authentication                               |
| Login failures / lockouts by **user id**, with a reason word            | `security_events` (14-day expiry) | brute-force protection                       |
| Every corpus-affecting action with actor username, object, before/after | `audit_log`                       | provenance and accountability                |
| Anonymous labels `Anon-######` + hashed claim token (Phase 4)           | `anon_identities`                 | let a reporter check status                  |

## What is not collected, by construction

- **No PII columns exist**: no email, phone, name, date of birth, location, photo. A test scans `information_schema` for such column names.
- **No IP addresses, device or browser fingerprints are stored.** `anon_identities` has no column for them. `security_events.ip_bucket` (an HMAC slot reserved by the schema) is unused in Milestone 1.
- **Request logs** carry method, path and status only; no client address, no user agent, no query strings.
- **No analytics, advertising or error-tracking SDK**: `scripts/check-dependency-allowlist.mjs` fails CI on known vendors; the API's CSP is `default-src 'none'`.
- **Reading behaviour never reaches the server**: bookmarks, favourites, positions, history and personal edits are reader-local by design (decision D-4).
- Corpus statistics are derived from corpus and decision records only.

## The reader

`apps/reader` stores downloaded bundles, the library catalogue, settings and reading positions in
the browser's IndexedDB only. It makes GET requests to the public API with `credentials: 'omit'`
and `referrerPolicy: 'no-referrer'`, has no analytics, and its Content Security Policy allows no
third-party origin. Nothing about reading behaviour leaves the device.

## Transient processing

The admin API rate limiter keeps per-connection counters in process memory for at most one minute
and writes nothing. This is the only place a client address is looked at.

## Retention

- `security_events`: 14 days (`expires_at`; a scheduled purge job is planned).
- `sessions`: expire after 12 hours; revoked rows may be deleted.
- Everything else is append-only and kept as part of the research record.

## Changing this page

Any addition to the data collected requires an explicit product decision recorded in
`docs/adr/` and an update here before code is merged.
