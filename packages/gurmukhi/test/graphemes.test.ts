import { describe, expect, it } from 'vitest';
import { segmentGraphemes, cpSlice, codepointLength } from '../src/index.js';
import { readFileSync } from 'node:fs';
import { seededGurmukhi } from './util.js';

const fx = JSON.parse(
  readFileSync(new URL('../fixtures/unicode-adversarial.json', import.meta.url), 'utf8'),
) as {
  recover_cases: string[];
};

function clusters(s: string): string[] {
  return segmentGraphemes(s).map((g) => cpSlice(s, g.cpStart, g.cpEnd));
}

describe('segmentGraphemes', () => {
  it('attaches matras, bindi/tippi, addak, nukta to the base', () => {
    expect(clusters('ਸਤਿਗੁਰੁ')).toEqual(['ਸ', 'ਤਿ', 'ਗੁ', 'ਰੁ']);
    expect(clusters('ਸੰਤ')).toEqual(['ਸੰ', 'ਤ']);
    expect(clusters('ਸੱਚ')).toEqual(['ਸੱ', 'ਚ']);
    expect(clusters('ਖ਼ਬਰ')).toEqual(['ਖ਼', 'ਬ', 'ਰ']);
  });
  it('joins virama conjuncts into one cluster', () => {
    expect(clusters('ਪ੍ਰਸਾਦਿ')).toEqual(['ਪ੍ਰ', 'ਸਾ', 'ਦਿ']);
    expect(clusters('ਸ੍ਵਰ')).toEqual(['ਸ੍ਵ', 'ਰ']);
  });
  it('keeps whitespace and punctuation as their own clusters', () => {
    expect(clusters('ਸਤਿ ਨਾਮੁ ॥')).toEqual(['ਸ', 'ਤਿ', ' ', 'ਨਾ', 'ਮੁ', ' ', '॥']);
  });
  it('preserves an orphan leading mark rather than dropping it', () => {
    expect(clusters('ਿਸ')).toEqual(['ਿ', 'ਸ']);
  });
  it('concatenation of clusters reproduces the input exactly (fixtures)', () => {
    for (const s of fx.recover_cases) {
      const segs = segmentGraphemes(s);
      expect(segs.map((g) => cpSlice(s, g.cpStart, g.cpEnd)).join('')).toBe(s);
      expect(segs.at(-1)?.cpEnd ?? 0).toBe(codepointLength(s));
    }
  });
  it('concatenation of clusters reproduces the input exactly (2000 seeded random strings)', () => {
    const rnd = seededGurmukhi(0xa5a5);
    for (let i = 0; i < 2000; i++) {
      const s = rnd(1 + (i % 40));
      expect(clusters(s).join('')).toBe(s);
    }
  });
});
