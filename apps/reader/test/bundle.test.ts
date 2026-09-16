import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { BUNDLE_FORMAT, bundleHashInput, type Bundle } from '@pothisahib/domain';
import { tokenize } from '@pothisahib/gurmukhi';
import { verifyBundle } from '../src/lib/bundle.ts';

const sha = (s: string): string =>
  createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

// SYNTHETIC TEST DATA - not Gurbani corpus data
function makeBundle(texts: string[]): Bundle {
  const lines = texts.map((text, i) => ({
    lineId: String(i + 1),
    sectionId: '1',
    ordinal: i,
    text,
    sha256: sha(text),
    codepointCount: [...text].length,
    tokens: tokenize(text).map((t) => [t.cpStart, t.cpEnd] as [number, number]),
  }));
  return {
    format: BUNDLE_FORMAT,
    bani: {
      id: '1',
      slug: 'test',
      name: 'Test',
      verificationState: 'PROVISIONAL',
      granth: { slug: 'g', name: 'G' },
    },
    versionNo: 1,
    basis: 'SOURCE_ADOPTION',
    publishedAt: null,
    source: null,
    sections: [{ id: '1', parentId: null, type: 'BODY', ordinal: 0, label: null }],
    lines,
    bundleSha256: sha(bundleHashInput(lines.map((l) => l.sha256))),
    generatedAt: new Date().toISOString(),
  };
}

describe('verifyBundle', () => {
  it('accepts a consistent bundle', async () => {
    const r = await verifyBundle(makeBundle(['ਸਤਿ ਨਾਮੁ', 'ਸਤਿਗੁਰੁ ਪ੍ਰਸਾਦਿ ॥', '']));
    expect(r.ok).toBe(true);
  });
  it('rejects a single altered codepoint (matra) even though the bundle hash field is untouched', async () => {
    const b = makeBundle(['ਸਤਿਗੁਰੁ']);
    (b.lines[0] as { text: string }).text = 'ਸਤਿਗੁਰੂ';
    const r = await verifyBundle(b);
    expect(r).toEqual({ ok: false, reason: 'line 0: text hash mismatch' });
  });
  it('rejects a tampered line hash that was also recomputed but not re-chained', async () => {
    const b = makeBundle(['ਸਤਿ', 'ਨਾਮੁ']);
    const l1 = b.lines[1] as {
      text: string;
      sha256: string;
      codepointCount: number;
      tokens: [number, number][];
    };
    l1.text = 'ਨਾਮ';
    l1.sha256 = sha('ਨਾਮ');
    l1.codepointCount = 3;
    l1.tokens = [[0, 3]];
    expect(await verifyBundle(b)).toEqual({ ok: false, reason: 'bundle hash mismatch' });
  });
  it('rejects malformed shapes and bad offsets', async () => {
    expect(await verifyBundle({ format: 'x' })).toEqual({ ok: false, reason: 'malformed bundle' });
    const b = makeBundle(['ਸਤਿ ਨਾਮੁ']);
    (b.lines[0] as { tokens: [number, number][] }).tokens = [[0, 99]];
    expect((await verifyBundle(b)).ok).toBe(false);
    const c = makeBundle(['ਸਤਿ ਨਾਮੁ']);
    (c.lines[0] as { codepointCount: number }).codepointCount = 3;
    expect((await verifyBundle(c)).ok).toBe(false);
  });
});
