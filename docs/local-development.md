# Local development

## Prerequisites

- Node.js 24 LTS (22.12+ works), pnpm 10 (`corepack enable` or `npm i -g pnpm@10`).
- Nothing else. PostgreSQL runs in-process via PGlite for development and tests.

## Setup

```bash
pnpm install
pnpm verify            # typecheck + lint + format + guards + all tests (~30 s)
```

## Zero-setup database

`DATABASE_URL=pglite://./.data/kosh` (the default the CLI assumes when the variable is unset)
persists a PostgreSQL database in `.data/kosh`. Then:

```bash
pnpm kosh migrate up
KOSH_PASSWORD='a-long-development-password' pnpm kosh user create --username dev-admin
pnpm kosh user mfa-enroll --username dev-admin          # prints secret + otpauth URI
pnpm kosh user mfa-confirm --username dev-admin --code <from your authenticator>
pnpm kosh user bootstrap-super-admin --username dev-admin
```

Run the services (two terminals):

```bash
pnpm dev:public        # http://localhost:8080/api/docs
pnpm dev:admin         # http://localhost:8081/admin/docs
```

Run the reader against the public API (third terminal; Vite proxies `/api` to port 8080):

```bash
pnpm --filter @pothisahib/reader dev    # http://localhost:5173
```

A `.env` file at the repository root is loaded by the services and the CLI (existing environment
variables win; nothing is logged). Relative `pglite://` and object-store paths resolve against the
repository root whichever package script started the process.

Note: a PGlite directory can be opened by **one process at a time**. For running both services
plus the CLI concurrently, use a real PostgreSQL (`docker run postgres:17-alpine` or a local
install) and set `DATABASE_URL=postgres://…`.

## Tests

```bash
pnpm test                                  # everything
pnpm --filter @pothisahib/gurmukhi test    # integrity core
pnpm test:db                               # database invariants
pnpm --filter @pothisahib/kosh-core test   # services (workflow, identity, parsers, TOTP)
pnpm --filter @pothisahib/api test         # HTTP workflow + security matrix
```

All fixtures are synthetic and labelled; no Gurbani is stored by tests.

## Conventions

- TypeScript strict, ESM, `.ts` imports (run with `tsx`/vitest; no build step in development).
- Never call `String.prototype.normalize` outside `packages/gurmukhi/src/normalize.ts` (lint + guard).
- Never edit an applied migration; add a new one.
- Every business write goes through kosh-core and writes an audit row in the same transaction.
- Run `pnpm format:write` before committing.
