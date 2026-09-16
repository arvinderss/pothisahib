/**
 * Per-stage timing of the line ingestion path against an in-memory database, to locate the cost.
 *   pnpm --filter @pothisahib/kosh-core exec tsx bench/stage-bench.ts
 */
import { createTestDb } from '@pothisahib/db/testing';
import {
  NORMALIZER_VERSION,
  normalizeEncoding,
  normalizeForComparison,
} from '@pothisahib/gurmukhi';
import { ensureSearchKeys, ensureSourceLayout, internText } from '../src/index.ts';

const db = await createTestDb();
// SYNTHETIC lines resembling real length (not Gurbani corpus data)
const lines = Array.from(
  { length: 40 },
  (_, i) => `ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ਨਿਰਭਉ ਨਿਰਵੈਰੁ ਅਕਾਲ ਮੂਰਤਿ ਅਜੂਨੀ ਸੈਭੰ ਗੁਰ ਪ੍ਰਸਾਦਿ ॥${i}॥`,
);
const t: Record<string, number> = {};
const time = async <T>(k: string, f: () => Promise<T>): Promise<T> => {
  const s = performance.now();
  const r = await f();
  t[k] = (t[k] ?? 0) + performance.now() - s;
  return r;
};
await db.query(
  `INSERT INTO sources (slug, name, source_type, license, redistribution, status) VALUES ('bench','bench','DATABASE','x','ALLOWED','ACTIVE')`,
);
await db.query(
  `INSERT INTO source_snapshots (source_id, fetched_at, sha256, byte_size, storage_key) VALUES (1, now(), sha256('x'::bytea), 1, 'snapshots/x')`,
);
await db.query(
  `INSERT INTO source_documents (snapshot_id, locator, parser_version) VALUES (1, 'd', 'bench')`,
);
const start = performance.now();
await db.transaction(async (tx) => {
  for (const [i, text] of lines.entries()) {
    const blobId = await time('intern', () => internText(tx, text));
    const layoutId = await time('layout+tokens', () => ensureSourceLayout(tx, blobId, text));
    await time('source_line insert', () =>
      tx.query(
        `INSERT INTO source_lines (snapshot_id, document_id, ordinal, blob_id, layout_id, locator) VALUES (1,1,$1,$2,$3,'{}'::jsonb)`,
        [i, blobId, layoutId],
      ),
    );
    const id = await time('source_line select', () =>
      tx.query<{ id: unknown }>(
        'SELECT id FROM source_lines WHERE document_id = 1 AND ordinal = $1',
        [i],
      ),
    );
    for (const [profile, fn] of [
      ['encoding-v1', normalizeEncoding],
      ['compare-v1', normalizeForComparison],
    ] as const) {
      const nb = await time('norm intern', () => internText(tx, fn(text)));
      await time('norm insert', () =>
        tx.query(`INSERT INTO source_normalizations VALUES ($1,$2,$3,$4)`, [
          String(id.rows[0]?.id),
          NORMALIZER_VERSION,
          profile,
          nb,
        ]),
      );
    }
    await time('search keys', () => ensureSearchKeys(tx, blobId, text));
  }
});
const total = performance.now() - start;
console.log(
  `total ${total.toFixed(0)} ms for ${lines.length} lines = ${(total / lines.length).toFixed(1)} ms/line`,
);
for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(20)} ${(v / lines.length).toFixed(1)} ms/line`);
await db.close();
