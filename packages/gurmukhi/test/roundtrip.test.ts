/**
 * Byte-exact recoverability through every in-process serialisation boundary this package
 * touches.  The database and API hops are covered in corpus/test and tests/unicode.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { seededGurmukhi } from './util.js';

const fx = JSON.parse(
  readFileSync(new URL('../fixtures/unicode-adversarial.json', import.meta.url), 'utf8'),
) as {
  recover_cases: string[];
  diff_cases: { a: string; b: string }[];
};
const all = [...fx.recover_cases, ...fx.diff_cases.flatMap((c) => [c.a, c.b])];
const rnd = seededGurmukhi(99);
for (let i = 0; i < 500; i++) all.push(rnd(1 + (i % 50)));

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

describe('original representation is always recoverable', () => {
  it('UTF-8 encode/decode', () => {
    for (const s of all) {
      const bytes = new TextEncoder().encode(s);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(s);
      expect(sha(new TextEncoder().encode(new TextDecoder().decode(bytes)))).toBe(sha(bytes));
    }
  });
  it('JSON serialise/parse', () => {
    for (const s of all) expect(JSON.parse(JSON.stringify({ s })).s).toBe(s);
  });
  it('structuredClone (IndexedDB storage semantics)', () => {
    for (const s of all) expect(structuredClone({ s }).s).toBe(s);
  });
  it('Buffer base64 (object storage transport)', () => {
    for (const s of all)
      expect(
        Buffer.from(Buffer.from(s, 'utf8').toString('base64'), 'base64').toString('utf8'),
      ).toBe(s);
  });
  it('fixture file itself is labelled as synthetic test data', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../fixtures/unicode-adversarial.json', import.meta.url), 'utf8'),
    ) as { _notice: string };
    expect(raw._notice).toMatch(/NOT Gurbani corpus data/);
  });
});
