/**
 * Build a single self-contained HTML file containing every published Bani.
 *
 * The file has no external requests of any kind: text, styles and behaviour are all inline, so it
 * can be opened from a USB stick, emailed, or kept on a phone with no network and no server.
 *
 * What is embedded, and nothing else:
 *   - the PUBLISHED accepted text of each Bani, byte for byte as stored, with its SHA-256;
 *   - word boundaries as codepoint offsets, which is what makes true Larivaar possible;
 *   - pause marks (vishraam) as codepoint positions carried from the source as an annotation
 *     layer, never as characters inserted into the text;
 *   - the source, licence and attribution of each Bani, and its verification state.
 *
 * Usage: node scripts/build-standalone.mjs [--out dist-alpha/pothi-sahib.html]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openDb } from '@pothisahib/db';
import { loadDotEnv } from '@pothisahib/kosh-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outPath = resolve(
  root,
  args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist-alpha/pothi-sahib.html',
);

loadDotEnv();
const db = await openDb(process.env['DATABASE_URL'] ?? 'pglite://./.data/kosh');

const banis = (
  await db.query(`
  SELECT b.slug, b.name, b.verification_state, g.slug AS granth_slug, g.name AS granth_name,
         v.id AS version_id, v.version_no, v.published_at,
         src.name AS source_name, src.license, src.attribution_text, src.url AS source_url
    FROM banis b
    JOIN granths g ON g.id = b.granth_id
    JOIN accepted_versions v ON v.bani_id = b.id AND v.status = 'PUBLISHED'
    LEFT JOIN sources src ON src.id = v.basis_source_id
   ORDER BY g.slug, b.name`)
).rows;

const out = { builtAt: new Date().toISOString(), banis: [] };

for (const b of banis) {
  const lines = (
    await db.query(
      `SELECT l.id AS line_id, l.ordinal,
              s.ordinal AS sec_ordinal, s.section_type, s.label AS sec_label,
              tb.raw_text, encode(tb.sha256, 'hex') AS sha256,
              alt.layout_id, sl.locator->'vishraam' AS vishraam
         FROM accepted_line_texts alt
         JOIN lines l ON l.id = alt.line_id
         JOIN sections s ON s.id = l.section_id
         JOIN text_blobs tb ON tb.id = alt.blob_id
         LEFT JOIN source_lines sl ON sl.id = alt.derived_from_source_line_id
        WHERE alt.accepted_version_id = $1
        ORDER BY s.ordinal, l.ordinal`,
      [b.version_id],
    )
  ).rows;

  const layoutIds = [...new Set(lines.map((l) => l.layout_id))];
  const tokenRows = (
    await db.query(
      `SELECT layout_id, cp_start, cp_end FROM tokens
        WHERE layout_id = ANY($1::bigint[]) ORDER BY layout_id, ordinal`,
      [layoutIds],
    )
  ).rows;
  const tokensByLayout = new Map();
  for (const t of tokenRows) {
    const list = tokensByLayout.get(t.layout_id) ?? [];
    list.push([Number(t.cp_start), Number(t.cp_end)]);
    tokensByLayout.set(t.layout_id, list);
  }

  const sections = [];
  const secIndex = new Map();
  for (const l of lines) {
    const key = `${l.sec_ordinal}`;
    if (!secIndex.has(key)) {
      secIndex.set(key, sections.length);
      sections.push({ t: l.section_type, l: l.sec_label });
    }
  }

  out.banis.push({
    slug: b.slug,
    name: b.name,
    granth: b.granth_name,
    granthSlug: b.granth_slug,
    state: b.verification_state,
    versionNo: b.version_no,
    source: {
      name: b.source_name,
      license: b.license,
      attribution: b.attribution_text,
      url: b.source_url,
    },
    sections,
    lines: lines.map((l) => {
      const row = {
        t: l.raw_text,
        w: tokensByLayout.get(l.layout_id) ?? [],
        s: secIndex.get(`${l.sec_ordinal}`),
        h: l.sha256.slice(0, 16),
      };
      const v = l.vishraam;
      if (Array.isArray(v) && v.length > 0)
        row.v = v.map((x) => [x.cp, x.kind === 'heavy' ? 2 : x.kind === 'medium' ? 1 : 0]);
      return row;
    }),
  });
}
await db.close();

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
out.commit = commit;

const template = readFileSync(join(root, 'scripts/standalone/template.html'), 'utf8');
const html = template.replace(
  '"__KOSH_DATA__"',
  JSON.stringify(out).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028'),
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, 'utf8');

const lineCount = out.banis.reduce((n, b) => n + b.lines.length, 0);
console.log(
  `${outPath}\n${out.banis.length} Banian, ${lineCount} lines, ${(html.length / 1048576).toFixed(2)} MiB`,
);
