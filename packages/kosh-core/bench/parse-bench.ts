/**
 * Ingestion benchmark: parse one Shabad OS Bani compilation into a fresh in-memory database.
 *   pnpm --filter @pothisahib/kosh-core exec tsx bench/parse-bench.ts <path-to-master.sqlite> [BANI_ID]
 * Reports wall time per line, to separate parser cost from persistence cost (docs/source-ingestion.md).
 */
import { readFileSync } from 'node:fs';
import { createTestDb } from '@pothisahib/db/testing';
import {
  FsObjectStore,
  ingestSnapshot,
  parseSnapshot,
  registerSource,
  createUser,
  type KoshContext,
} from '../src/index.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
const bani = process.argv[3] ?? 'JAPJ';
if (!file) throw new Error('usage: parse-bench.ts <master.sqlite> [BANI_ID]');

const db = await createTestDb();
const ctx: KoshContext = {
  db,
  store: new FsObjectStore(mkdtempSync(join(tmpdir(), 'kosh-bench-'))),
  mfaKey: 'bench-key-0000000000',
};
const u = await createUser(db, { username: 'bench', password: 'bench-password-000000' });
const actor = { userId: u.id, username: u.username };
await registerSource(
  db,
  {
    slug: 'bench',
    name: 'bench',
    sourceType: 'DATABASE',
    license: 'x',
    redistribution: 'ALLOWED',
    status: 'ACTIVE',
  },
  actor,
);
const t0 = performance.now();
const snap = await ingestSnapshot(ctx, { sourceSlug: 'bench', bytes: readFileSync(file) }, actor);
const t1 = performance.now();
const r = await parseSnapshot(
  ctx,
  { snapshotId: snap.snapshot.id, format: 'shabados-sqlite-v1', options: { banis: [bani] } },
  actor,
);
const t2 = performance.now();
console.log(
  `ingest ${(t1 - t0).toFixed(0)} ms; parse ${bani}: ${r.lineCount} lines in ${(t2 - t1).toFixed(0)} ms = ${((t2 - t1) / r.lineCount).toFixed(1)} ms/line`,
);
await db.close();
