# Pothi Sahib — Project Principles

Anyone cloning this repository must read this file before reading any code.
These rules are non-negotiable and override convenience, velocity and personal preference.

## Non-Negotiable

1. Never invent Gurbani.
2. Never silently alter source Gurbani.
3. Preserve original Unicode exactly.
4. Never automatically publish corpus corrections.
5. Canonical changes require human review.
6. Maintain provenance for corpus content.
7. Preserve correction history.
8. Personal edits are never canonical.
9. Public API is read-only.
10. Enforce authorization server-side.
11. Do not collect unnecessary PII.
12. Do not implement analytics or behavioural tracking.
13. Do not introduce questionable font/content licenses.
14. Do not introduce vendor lock-in unnecessarily.
15. Never destroy historical corpus information.
16. Do not use fabricated Gurbani as real corpus data.

## Architectural Principle

Source data and accepted data are separate.

```
SOURCE
→ PRESERVE
→ COMPARE
→ REVIEW
→ ACCEPT
```

The application must never collapse these layers into one mutable text field.

## How the code enforces these rules

| Rule   | Mechanism                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2, 3   | `text_blobs.raw_bytes` (bytea) is definitive with `sha256` identity and CHECKs; `UPDATE`/`DELETE` raise via trigger; parsers decode UTF-8 fatally; `String.prototype.normalize` is forbidden by lint **and** by `scripts/check-no-normalize.mjs` outside `packages/gurmukhi/src/normalize.ts`.                               |
| 4, 5   | No mutable text column exists. A change is only ever a new `accepted_versions` row; a trigger refuses to publish it without a `decisions` row created from two `version_approvals` by distinct EDITOR/SUPER_ADMIN accounts whose roles were captured at the time. The `kosh_ingest` role has no grant on the accepted layer. |
| 6      | Every `source_lines` row points at a hashed, immutable `source_snapshots` row of a `sources` row with licence metadata; `accepted_line_texts.derived_from_source_line_id` records the exact reading adopted.                                                                                                                 |
| 7, 15  | `accepted_versions`, `source_*`, `decisions`, `version_approvals`, `audit_log` are append-only. Rollback creates a new version pointing at the one it restores.                                                                                                                                                              |
| 9      | The public API process runs as `kosh_public`, which holds `SELECT` on `public_api.*` views only; its route table contains only GET/HEAD (tested).                                                                                                                                                                            |
| 10     | Every admin route passes `requireAction()` against the server-side permission matrix; roles are loaded from the database per request; the database independently refuses self-grants, MFA-less privileged grants and ineligible approvers.                                                                                   |
| 11, 12 | No email/phone/name/photo column exists (tested). No IP/device/fingerprint column exists. `scripts/check-dependency-allowlist.mjs` fails CI on analytics/ads/fingerprinting packages. Request logs omit addresses. Reader behaviour will live only in IndexedDB.                                                             |
| 13     | Unicode fonts with recorded open licences only (`docs/fonts.md`).                                                                                                                                                                                                                                                            |
| 14     | Only the PostgreSQL protocol, a filesystem/S3 object interface and HTTP are assumed.                                                                                                                                                                                                                                         |
| 16     | Test fixtures are synthetic and labelled; `corpus/seeds/` (when created) may never contain Gurbani.                                                                                                                                                                                                                          |

When a requirement and one of these rules conflict, the rule wins and the conflict is recorded in `docs/RISK_REGISTER.md`.
