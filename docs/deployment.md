# Deployment

The application depends only on the PostgreSQL wire protocol, a filesystem (or later S3) object
store, and HTTP. No vendor service is assumed.

## Canonical topology: Docker Compose

`deployment/docker-compose.yml` starts PostgreSQL 17, a one-shot migrator, the public API and the
admin API from one image (`deployment/Dockerfile`). Login roles with passwords are created by
`deployment/postgres/init/01-roles.sh` on first initialisation.

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, KOSH_PUBLIC_PASSWORD, KOSH_APP_PASSWORD, KOSH_INGEST_PASSWORD, KOSH_MFA_KEY
docker compose -f deployment/docker-compose.yml --env-file .env up -d --build
docker compose -f deployment/docker-compose.yml logs migrate
curl http://localhost:8080/health
```

The admin API is published on `127.0.0.1:8081` only. Put a TLS-terminating reverse proxy in
front of both services; restrict the admin origin to trusted networks.

**Verification status: the Compose topology and Dockerfile were written against documented
images and commands but could not be executed on the Milestone-1 development machine (Docker was
not installed). The first `docker compose up` is a verification step; record the outcome here.**

## Without Docker (single host, VPS, Raspberry Pi)

1. Install Node 24 LTS, pnpm 10, PostgreSQL 17 (`--encoding=UTF8 --locale=C`).
2. Create the database and owner role; create `kosh_public`, `kosh_app`, `kosh_ingest` LOGIN roles with passwords (or let migration 0001 create them and `ALTER ROLE … PASSWORD` afterwards).
3. `pnpm install --frozen-lockfile`, then `DATABASE_URL=postgres://kosh_owner:…/gurbani_kosh pnpm kosh migrate up`.
4. Run `pnpm --filter @pothisahib/api start:public` with `PUBLIC_DATABASE_URL` (kosh_public) and `start:admin` with `APP_DATABASE_URL` (kosh_app) and `KOSH_MFA_KEY`, under a process supervisor (systemd units are straightforward: one per service).

## First accounts

```bash
KOSH_PASSWORD='…' pnpm kosh user create --username first-admin
pnpm kosh user mfa-enroll --username first-admin        # scan the otpauth URI
pnpm kosh user mfa-confirm --username first-admin --code 123456
pnpm kosh user bootstrap-super-admin --username first-admin   # only while no Super Admin exists
```

## Zero-cost pilot mapping

Because only the three protocols above are assumed, the free-tier pilot is a configuration
choice: a static host for the PWA (when it exists), a container host for the two API processes,
a managed PostgreSQL free tier for `DATABASE_URL`, and a persistent volume or S3-compatible
bucket for objects. Moving hosts is a change of environment variables plus a backup/restore.

## The reader

`pnpm --filter @pothisahib/reader build` produces a static site in `apps/reader/dist` (app shell,
service worker, manifest). Host it on any static host; set `VITE_API_BASE` at build time to the
public API origin (default `/api/v1`, i.e. same origin behind one reverse proxy). Serve it with
`Content-Security-Policy` and `X-Frame-Options: DENY` headers at the host (the meta CSP in
`index.html` is a fallback and cannot express `frame-ancestors`).

## Health checks

`GET /health` on both services returns `{"status":"ok"}` once the database connection is usable.
