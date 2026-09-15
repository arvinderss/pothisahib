/**
 * Snapshot ingestion: External artefact -> hash -> immutable object -> source_snapshots row.
 * It stops there. Nothing is parsed, nothing is published (Instruction §37).
 */
import type { Db } from '@pothisahib/db';
import { audit } from './audit.ts';
import { iso, str, type Actor, type KoshContext } from './context.ts';
import { sha256, sha256Hex } from './crypto.ts';
import { BadRequestError, fromDb, IntegrityError, NotFoundError } from './errors.ts';
import { getSource } from './sources.ts';

export interface Snapshot {
  id: string;
  sourceId: string;
  fetchedAt: string | null;
  sha256Hex: string;
  byteSize: number;
  storageKey: string;
  contentPresent: boolean;
  sourceVersion: string | null;
  notes: string | null;
}

const COLS = `id, source_id, fetched_at, encode(sha256,'hex') AS sha, byte_size, storage_key, content_present, source_version, notes`;

function rowToSnapshot(r: Record<string, unknown>): Snapshot {
  return {
    id: str(r['id']),
    sourceId: str(r['source_id']),
    fetchedAt: iso(r['fetched_at']),
    sha256Hex: str(r['sha']),
    byteSize: Number(r['byte_size']),
    storageKey: str(r['storage_key']),
    contentPresent: Boolean(r['content_present']),
    sourceVersion: (r['source_version'] as string | null) ?? null,
    notes: (r['notes'] as string | null) ?? null,
  };
}

export interface IngestInput {
  sourceSlug: string;
  bytes: Uint8Array;
  fetchedAt?: Date;
  sourceVersion?: string | null;
  notes?: string | null;
}

export interface IngestResult {
  snapshot: Snapshot;
  /** true when an identical artefact for this source had already been ingested (SRS §75). */
  duplicate: boolean;
}

export async function ingestSnapshot(
  ctx: KoshContext,
  input: IngestInput,
  actor: Actor,
): Promise<IngestResult> {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0)
    throw new BadRequestError('empty artefact');
  if (
    input.sourceVersion !== undefined &&
    input.sourceVersion !== null &&
    input.sourceVersion.length > 200
  )
    throw new BadRequestError('invalid sourceVersion');
  const source = await getSource(ctx.db, input.sourceSlug);
  if (!source) throw new NotFoundError('source');
  if (source.status === 'PROPOSED')
    throw new IntegrityError(
      'source is PROPOSED: record its licence and set it ACTIVE before ingesting',
    );
  if (source.status === 'RETIRED') throw new IntegrityError('source is RETIRED');

  const hash = sha256(input.bytes);
  const existing = await ctx.db.query<Record<string, unknown>>(
    `SELECT ${COLS} FROM source_snapshots WHERE source_id = $1 AND sha256 = $2`,
    [source.id, hash],
  );
  const dup = existing.rows[0];
  if (dup) return { snapshot: rowToSnapshot(dup), duplicate: true };

  const storageKey = await ctx.store.put(input.bytes, 'snapshots');
  if (!storageKey.endsWith(sha256Hex(input.bytes)))
    throw new Error('object store returned a mismatched key');

  return ctx.db.transaction(async (tx) => {
    let r;
    try {
      r = await tx.query<Record<string, unknown>>(
        `INSERT INTO source_snapshots (source_id, fetched_at, sha256, byte_size, storage_key, source_version, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
        [
          source.id,
          input.fetchedAt ?? new Date(),
          hash,
          input.bytes.length,
          storageKey,
          input.sourceVersion ?? null,
          input.notes ?? null,
        ],
      );
    } catch (e) {
      fromDb(e);
    }
    const snap = rowToSnapshot(r.rows[0] as Record<string, unknown>);
    await tx.query(
      'UPDATE sources SET last_checked_at = now(), last_synced_at = now() WHERE id = $1',
      [source.id],
    );
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'SNAPSHOT_INGEST',
      objectType: 'source_snapshot',
      objectId: snap.id,
      after: {
        sourceSlug: source.slug,
        sha256: snap.sha256Hex,
        byteSize: snap.byteSize,
        sourceVersion: snap.sourceVersion,
      },
    });
    return { snapshot: snap, duplicate: false };
  });
}

export async function getSnapshot(db: Db, id: string): Promise<Snapshot | null> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${COLS} FROM source_snapshots WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToSnapshot(row) : null;
}

const SN_COLS = `sn.id, sn.source_id, sn.fetched_at, encode(sn.sha256,'hex') AS sha, sn.byte_size, sn.storage_key, sn.content_present, sn.source_version, sn.notes`;

export async function listSnapshots(db: Db, sourceSlug?: string): Promise<Snapshot[]> {
  const r = sourceSlug
    ? await db.query<Record<string, unknown>>(
        `SELECT ${SN_COLS} FROM source_snapshots sn JOIN sources s ON s.id = sn.source_id WHERE s.slug = $1 ORDER BY sn.id`,
        [sourceSlug],
      )
    : await db.query<Record<string, unknown>>(
        `SELECT ${SN_COLS} FROM source_snapshots sn ORDER BY sn.id`,
      );
  return r.rows.map(rowToSnapshot);
}
