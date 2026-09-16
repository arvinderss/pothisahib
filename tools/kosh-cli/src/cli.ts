#!/usr/bin/env node
/**
 * kosh — operator CLI for Gurbani Kosh.
 *
 *   kosh migrate up|down [--all]|status
 *   kosh source add --slug s --name n --type DATABASE [--url u] [--license l] [--license-url u] [--redistribution R] [--status S] [--publisher p] [--notes n] --as USER
 *   kosh source set --slug s [--status S] [--license l] [--redistribution R] [...] --as USER
 *   kosh source list
 *   kosh snapshot ingest --source s --file path [--version v] [--notes n] --as USER
 *   kosh snapshot parse --id N --format txt|kosh-source-v1 --as USER
 *   kosh snapshot list [--source s]
 *   kosh corpus ensure --corpus slug:Name --granth slug:Name --bani slug:Name --as USER
 *   kosh bani bootstrap --bani slug --document N --as USER
 *   kosh bani adopt-document --bani slug --granth g --name "Name" --document N --rationale "..." --as USER
 *   kosh snapshot parse --id N --format shabados-sqlite-v1 [--scope banis] [--banis JAPJ,JAAP] --as USER
 *   kosh version adopt --bani slug --document N --rationale "..." --as USER
 *   kosh version approve --id N --as USER | kosh version publish --id N --as USER | kosh version list --bani slug
 *   kosh user create --username u            (password read from KOSH_PASSWORD or prompted)
 *   kosh user mfa-enroll --username u | kosh user mfa-confirm --username u --code 123456
 *   kosh user bootstrap-super-admin --username u
 *   kosh user grant --username u --role R --as SUPER_ADMIN_USER | kosh user revoke ...
 *
 * `--as` names the acting account for authorisation and audit attribution. The CLI runs with the
 * operator's database credentials; it scopes itself to the kosh_ingest / kosh_app roles so that
 * the same grant boundaries the services live under apply here too (KOSH_SCOPE_ROLES=false disables).
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { invocationDir, migrate, openDb, withRole, type Db, type KoshRole } from '@pothisahib/db';
import {
  effectiveRole,
  isRole,
  roleAtLeast,
  type Role,
  type SourceType,
  type Redistribution,
  type SourceStatus,
} from '@pothisahib/domain';
import {
  approveVersion,
  bootstrapStructureFromDocument,
  bootstrapSuperAdmin,
  confirmMfa,
  createAdoptionDraft,
  createUser,
  enrollMfa,
  ensureBani,
  ensureCorpus,
  ensureGranth,
  FsObjectStore,
  getBani,
  getUserByUsername,
  grantRole,
  ingestSnapshot,
  listSnapshots,
  loadDotEnv,
  listSources,
  listVersions,
  parseSnapshot,
  publishVersion,
  registerSource,
  revokeRole,
  updateSource,
  type Actor,
  type KoshContext,
} from '@pothisahib/kosh-core';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'corpus',
  'migrations',
);

const OPTIONS = {
  all: { type: 'boolean' },
  slug: { type: 'string' },
  name: { type: 'string' },
  type: { type: 'string' },
  url: { type: 'string' },
  license: { type: 'string' },
  'license-url': { type: 'string' },
  redistribution: { type: 'string' },
  status: { type: 'string' },
  publisher: { type: 'string' },
  notes: { type: 'string' },
  source: { type: 'string' },
  file: { type: 'string' },
  version: { type: 'string' },
  id: { type: 'string' },
  format: { type: 'string' },
  corpus: { type: 'string' },
  granth: { type: 'string' },
  bani: { type: 'string' },
  document: { type: 'string' },
  rationale: { type: 'string' },
  username: { type: 'string' },
  role: { type: 'string' },
  code: { type: 'string' },
  as: { type: 'string' },
  json: { type: 'boolean' },
  scope: { type: 'string' },
  banis: { type: 'string' },
  attribution: { type: 'string' },
} as const;

function need(v: string | undefined, flag: string): string {
  if (!v) throw new Error(`--${flag} is required`);
  return v;
}

function out(v: unknown, json: boolean | undefined): void {
  console.log(
    json ? JSON.stringify(v, null, 2) : typeof v === 'string' ? v : JSON.stringify(v, null, 2),
  );
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const [group, cmd] = positionals;
  if (!group) {
    console.log(
      (
        readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)?.[1] ??
        ''
      ).replace(/^\s*\* ?/gm, ''),
    );
    return;
  }
  loadDotEnv();
  const url = process.env['DATABASE_URL'] ?? 'pglite://./.data/kosh';
  if (!process.env['DATABASE_URL']) console.error(`DATABASE_URL not set; using ${url}`);
  const scopeRoles = process.env['KOSH_SCOPE_ROLES'] !== 'false';
  const owner = await openDb(url);
  const scoped = (role: KoshRole): Db => (scopeRoles ? withRole(owner, role) : owner);
  const mfaKey =
    process.env['KOSH_MFA_KEY'] ?? (url.startsWith('pglite://') ? 'dev-insecure-mfa-key-0000' : '');
  if (!mfaKey) throw new Error('KOSH_MFA_KEY is required for a PostgreSQL database');
  const store = new FsObjectStore(
    resolve(invocationDir(), process.env['KOSH_OBJECT_STORE_DIR'] ?? '.data/objects'),
  );
  const appDb = scoped('kosh_app');
  const ingestDb = scoped('kosh_ingest');
  const appCtx: KoshContext = { db: appDb, store, mfaKey };
  const ingestCtx: KoshContext = { db: ingestDb, store, mfaKey };

  /** Resolve --as to an actor and check the minimum role against live grants (server-side rule, applied here too). */
  const actor = async (min: Role): Promise<Actor> => {
    const u = await getUserByUsername(appDb, need(values.as, 'as'));
    if (!u) throw new Error(`--as user not found`);
    if (!roleAtLeast(effectiveRole(u.roles), min))
      throw new Error(`${u.username} holds ${effectiveRole(u.roles)}; ${min} required`);
    return { userId: u.id, username: u.username };
  };

  try {
    switch (`${group} ${cmd ?? ''}`.trim()) {
      case 'migrate up':
      case 'migrate down':
      case 'migrate status':
        await migrate(owner, MIGRATIONS_DIR, cmd as 'up' | 'down' | 'status', {
          all: values.all ?? false,
        });
        return;

      case 'source list':
        return out(await listSources(appDb), values.json);
      case 'source add': {
        const a = await actor('EDITOR');
        const s = await registerSource(
          appDb,
          {
            slug: need(values.slug, 'slug'),
            name: need(values.name, 'name'),
            sourceType: need(values.type, 'type') as SourceType,
            url: values.url ?? null,
            license: values.license ?? null,
            licenseUrl: values['license-url'] ?? null,
            publisher: values.publisher ?? null,
            attributionText: values.attribution ?? null,
            notes: values.notes ?? null,
            ...(values.redistribution
              ? { redistribution: values.redistribution as Redistribution }
              : {}),
            ...(values.status ? { status: values.status as SourceStatus } : {}),
          },
          a,
        );
        return out(s, values.json);
      }
      case 'source set': {
        const a = await actor('EDITOR');
        const s = await updateSource(
          appDb,
          need(values.slug, 'slug'),
          {
            ...(values.name ? { name: values.name } : {}),
            ...(values.url ? { url: values.url } : {}),
            ...(values.license ? { license: values.license } : {}),
            ...(values['license-url'] ? { licenseUrl: values['license-url'] } : {}),
            ...(values.publisher ? { publisher: values.publisher } : {}),
            ...(values.attribution ? { attributionText: values.attribution } : {}),
            ...(values.notes ? { notes: values.notes } : {}),
            ...(values.redistribution
              ? { redistribution: values.redistribution as Redistribution }
              : {}),
            ...(values.status ? { status: values.status as SourceStatus } : {}),
          },
          a,
          values.rationale,
        );
        return out(s, values.json);
      }

      case 'snapshot list':
        return out(await listSnapshots(appDb, values.source), values.json);
      case 'snapshot ingest': {
        const a = await actor('EDITOR');
        const bytes = readFileSync(need(values.file, 'file'));
        const r = await ingestSnapshot(
          ingestCtx,
          {
            sourceSlug: need(values.source, 'source'),
            bytes,
            sourceVersion: values.version ?? null,
            notes: values.notes ?? null,
          },
          a,
        );
        return out(
          {
            ...r,
            note: r.duplicate ? 'identical artefact already ingested for this source' : 'stored',
          },
          values.json,
        );
      }
      case 'snapshot parse': {
        const a = await actor('EDITOR');
        const options: Record<string, unknown> = {};
        if (values.scope) options['scope'] = values.scope;
        if (values.banis)
          options['banis'] = values.banis
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        return out(
          await parseSnapshot(
            ingestCtx,
            { snapshotId: need(values.id, 'id'), format: need(values.format, 'format'), options },
            a,
          ),
          values.json,
        );
      }

      case 'corpus ensure': {
        const a = await actor('EDITOR');
        const split = (v: string, flag: string): [string, string] => {
          const i = v.indexOf(':');
          if (i < 1) throw new Error(`--${flag} must be slug:Name`);
          return [v.slice(0, i), v.slice(i + 1)];
        };
        const [cs, cn] = split(need(values.corpus, 'corpus'), 'corpus');
        const [gs, gn] = split(need(values.granth, 'granth'), 'granth');
        const [bs, bn] = split(need(values.bani, 'bani'), 'bani');
        await ensureCorpus(appDb, cs, cn);
        await ensureGranth(appDb, cs, gs, gn);
        return out(await ensureBani(appDb, { granthSlug: gs, slug: bs, name: bn }, a), values.json);
      }
      case 'bani adopt-document': {
        // ensure the Bani record, bootstrap its structure from the document, and open an adoption DRAFT
        const a = await actor('EDITOR');
        const slug = need(values.bani, 'bani');
        const documentId = need(values.document, 'document');
        const bani = await ensureBani(
          appDb,
          { granthSlug: need(values.granth, 'granth'), slug, name: need(values.name, 'name') },
          a,
        );
        const structure = await bootstrapStructureFromDocument(
          appDb,
          { baniSlug: slug, documentId },
          a,
        );
        const draft = await createAdoptionDraft(
          appDb,
          { baniSlug: slug, documentId, rationale: need(values.rationale, 'rationale') },
          a,
        );
        return out(
          {
            bani: bani.slug,
            sections: structure.sections,
            lines: structure.lines,
            draft: { id: draft.id, versionNo: draft.versionNo, status: draft.status },
          },
          values.json,
        );
      }
      case 'bani bootstrap': {
        const a = await actor('EDITOR');
        return out(
          await bootstrapStructureFromDocument(
            appDb,
            { baniSlug: need(values.bani, 'bani'), documentId: need(values.document, 'document') },
            a,
          ),
          values.json,
        );
      }

      case 'version list': {
        const b = await getBani(appDb, need(values.bani, 'bani'));
        if (!b) throw new Error('bani not found');
        return out(await listVersions(appDb, b.id), values.json);
      }
      case 'version adopt': {
        const a = await actor('EDITOR');
        return out(
          await createAdoptionDraft(
            appDb,
            {
              baniSlug: need(values.bani, 'bani'),
              documentId: need(values.document, 'document'),
              rationale: need(values.rationale, 'rationale'),
            },
            a,
          ),
          values.json,
        );
      }
      case 'version approve': {
        const a = await actor('EDITOR');
        return out(
          await approveVersion(
            appDb,
            { versionId: need(values.id, 'id'), notes: values.notes ?? null },
            a,
          ),
          values.json,
        );
      }
      case 'version publish': {
        const a = await actor('EDITOR');
        return out(
          await publishVersion(appDb, { versionId: need(values.id, 'id') }, a),
          values.json,
        );
      }

      case 'user create': {
        const username = need(values.username, 'username');
        let password = process.env['KOSH_PASSWORD'];
        if (!password) {
          if (!process.stdin.isTTY) throw new Error('set KOSH_PASSWORD or run interactively');
          const rl = createInterface({ input: process.stdin, output: process.stderr });
          password = await rl.question('Password (min 12 chars): ');
          rl.close();
        }
        const u = await createUser(appDb, { username, password });
        return out({ id: u.id, username: u.username, roles: u.roles }, values.json);
      }
      case 'user mfa-enroll': {
        const u = await getUserByUsername(appDb, need(values.username, 'username'));
        if (!u) throw new Error('user not found');
        const e = await enrollMfa(appCtx, u.id);
        console.error(
          'Add this to your authenticator app, then run: kosh user mfa-confirm --username ' +
            u.username +
            ' --code 123456',
        );
        return out(e, values.json);
      }
      case 'user mfa-confirm': {
        const u = await getUserByUsername(appDb, need(values.username, 'username'));
        if (!u) throw new Error('user not found');
        const r = await confirmMfa(appCtx, u.id, need(values.code, 'code'));
        console.error(
          'MFA confirmed. Store these one-time recovery codes safely; they will not be shown again.',
        );
        return out(r, values.json);
      }
      case 'user bootstrap-super-admin':
        return out(
          await bootstrapSuperAdmin(appDb, need(values.username, 'username')),
          values.json,
        );
      case 'user grant': {
        const a = await actor('SUPER_ADMIN');
        const role = need(values.role, 'role');
        if (!isRole(role)) throw new Error('invalid role');
        return out(
          await grantRole(
            appDb,
            { username: need(values.username, 'username'), role, reason: values.notes ?? null },
            a,
          ),
          values.json,
        );
      }
      case 'user revoke': {
        const a = await actor('SUPER_ADMIN');
        const role = need(values.role, 'role');
        if (!isRole(role)) throw new Error('invalid role');
        return out(
          await revokeRole(
            appDb,
            { username: need(values.username, 'username'), role, reason: values.notes ?? null },
            a,
          ),
          values.json,
        );
      }
      default:
        throw new Error(`unknown command: ${group} ${cmd ?? ''}`);
    }
  } finally {
    await owner.close();
  }
}

main().catch((e: unknown) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});
