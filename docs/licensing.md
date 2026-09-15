# Software licensing

The software (frontend, backend, schema, tooling, tests, deployment, documentation) is licensed
under **Apache-2.0** (`LICENSE`). Decision D-1 in `HANDOVER.md`: recommended by the assessment for
its explicit patent grant and contribution terms; the project owner has indicated agreement but a
final one-word confirmation is still requested before the first public release.

Corpus/data licensing is a **separate** concern: see [corpus-licensing.md](corpus-licensing.md).

## Runtime dependencies (Milestone 1)

| Package                                                             | Licence    | Role                                  |
| ------------------------------------------------------------------- | ---------- | ------------------------------------- |
| fastify, @fastify/swagger, @fastify/swagger-ui, @fastify/rate-limit | MIT        | HTTP                                  |
| pg                                                                  | MIT        | PostgreSQL driver                     |
| @electric-sql/pglite                                                | Apache-2.0 | PostgreSQL in WebAssembly (dev/tests) |
| @node-rs/argon2                                                     | MIT        | Argon2id password hashing             |
| tsx                                                                 | MIT        | TypeScript execution                  |

Development-only: typescript, vitest, eslint, typescript-eslint, prettier, @types/*: all MIT/Apache-2.0.

`scripts/check-dependency-allowlist.mjs` blocks analytics/tracking packages; licence review of
new dependencies is part of code review. Fonts, when added, are documented per font in `fonts.md`.
