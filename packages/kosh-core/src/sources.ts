import type { Db } from '@pothisahib/db';
import {
  isSlug,
  oneOf,
  REDISTRIBUTION,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type Redistribution,
  type SourceStatus,
  type SourceType,
} from '@pothisahib/domain';
import { audit } from './audit.ts';
import { iso, str, type Actor } from './context.ts';
import { BadRequestError, fromDb, NotFoundError } from './errors.ts';

export interface SourceInput {
  slug: string;
  name: string;
  sourceType: SourceType;
  url?: string | null;
  publisher?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  attributionText?: string | null;
  redistribution?: Redistribution;
  importMethod?: string | null;
  notes?: string | null;
  status?: SourceStatus;
}

export interface Source {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  sourceType: SourceType;
  publisher: string | null;
  license: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  redistribution: Redistribution;
  importMethod: string | null;
  status: SourceStatus;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  notes: string | null;
  createdAt: string | null;
}

const COLS = `id, slug, name, url, source_type, publisher, license, license_url, attribution_text, redistribution,
  import_method, status, last_checked_at, last_synced_at, notes, created_at`;

function rowToSource(r: Record<string, unknown>): Source {
  return {
    id: str(r['id']),
    slug: str(r['slug']),
    name: str(r['name']),
    url: (r['url'] as string | null) ?? null,
    sourceType: r['source_type'] as SourceType,
    publisher: (r['publisher'] as string | null) ?? null,
    license: (r['license'] as string | null) ?? null,
    licenseUrl: (r['license_url'] as string | null) ?? null,
    attributionText: (r['attribution_text'] as string | null) ?? null,
    redistribution: r['redistribution'] as Redistribution,
    importMethod: (r['import_method'] as string | null) ?? null,
    status: r['status'] as SourceStatus,
    lastCheckedAt: iso(r['last_checked_at']),
    lastSyncedAt: iso(r['last_synced_at']),
    notes: (r['notes'] as string | null) ?? null,
    createdAt: iso(r['created_at']),
  };
}

function validate(input: Partial<SourceInput>, creating: boolean): void {
  if (creating || input.slug !== undefined)
    if (!isSlug(input.slug)) throw new BadRequestError('invalid slug');
  if (creating || input.name !== undefined)
    if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.length > 200)
      throw new BadRequestError('invalid name');
  if (creating || input.sourceType !== undefined)
    if (!oneOf(SOURCE_TYPES, input.sourceType)) throw new BadRequestError('invalid sourceType');
  if (input.redistribution !== undefined && !oneOf(REDISTRIBUTION, input.redistribution))
    throw new BadRequestError('invalid redistribution');
  if (input.status !== undefined && !oneOf(SOURCE_STATUSES, input.status))
    throw new BadRequestError('invalid status');
  if (input.url !== undefined && input.url !== null) {
    let u: URL;
    try {
      u = new URL(input.url);
    } catch {
      throw new BadRequestError('invalid url');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
      throw new BadRequestError('url must be http(s)');
  }
  for (const k of [
    'publisher',
    'license',
    'licenseUrl',
    'attributionText',
    'importMethod',
    'notes',
  ] as const) {
    const v = input[k];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > 4000))
      throw new BadRequestError(`invalid ${k}`);
  }
}

export async function registerSource(db: Db, input: SourceInput, actor: Actor): Promise<Source> {
  validate(input, true);
  return db.transaction(async (tx) => {
    let r;
    try {
      r = await tx.query<Record<string, unknown>>(
        `INSERT INTO sources (slug, name, url, source_type, publisher, license, license_url, attribution_text,
                              redistribution, import_method, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${COLS}`,
        [
          input.slug,
          input.name,
          input.url ?? null,
          input.sourceType,
          input.publisher ?? null,
          input.license ?? null,
          input.licenseUrl ?? null,
          input.attributionText ?? null,
          input.redistribution ?? 'UNKNOWN',
          input.importMethod ?? null,
          input.notes ?? null,
          input.status ?? 'PROPOSED',
        ],
      );
    } catch (e) {
      fromDb(e);
    }
    const src = rowToSource(r.rows[0] as Record<string, unknown>);
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'SOURCE_REGISTER',
      objectType: 'source',
      objectId: src.id,
      after: src,
    });
    return src;
  });
}

export type SourcePatch = Partial<Omit<SourceInput, 'slug'>>;

export async function updateSource(
  db: Db,
  slug: string,
  patch: SourcePatch,
  actor: Actor,
  reason?: string,
): Promise<Source> {
  validate(patch, false);
  return db.transaction(async (tx) => {
    const before = await getSource(tx, slug);
    if (!before) throw new NotFoundError('source');
    const sets: string[] = [];
    const vals: unknown[] = [];
    const map: Record<string, string> = {
      name: 'name',
      url: 'url',
      sourceType: 'source_type',
      publisher: 'publisher',
      license: 'license',
      licenseUrl: 'license_url',
      attributionText: 'attribution_text',
      redistribution: 'redistribution',
      importMethod: 'import_method',
      notes: 'notes',
      status: 'status',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (patch as Record<string, unknown>)[k];
      if (v !== undefined) {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      }
    }
    if (sets.length === 0) throw new BadRequestError('nothing to update');
    vals.push(before.id);
    let r;
    try {
      r = await tx.query<Record<string, unknown>>(
        `UPDATE sources SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${COLS}`,
        vals,
      );
    } catch (e) {
      fromDb(e);
    }
    const after = rowToSource(r.rows[0] as Record<string, unknown>);
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'SOURCE_UPDATE',
      objectType: 'source',
      objectId: after.id,
      before,
      after,
      reason: reason ?? null,
    });
    return after;
  });
}

export async function getSource(db: Db, slug: string): Promise<Source | null> {
  const r = await db.query<Record<string, unknown>>(`SELECT ${COLS} FROM sources WHERE slug = $1`, [
    slug,
  ]);
  const row = r.rows[0];
  return row ? rowToSource(row) : null;
}

export async function getSourceById(db: Db, id: string): Promise<Source | null> {
  const r = await db.query<Record<string, unknown>>(`SELECT ${COLS} FROM sources WHERE id = $1`, [
    id,
  ]);
  const row = r.rows[0];
  return row ? rowToSource(row) : null;
}

export async function listSources(db: Db): Promise<Source[]> {
  const r = await db.query<Record<string, unknown>>(`SELECT ${COLS} FROM sources ORDER BY id`);
  return r.rows.map(rowToSource);
}
