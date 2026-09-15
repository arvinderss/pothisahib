import { describe, expect, it } from 'vitest';
import {
  tokenize,
  tokenText,
  larivaarView,
  snapToTokens,
  cpSlice,
  codepointLength,
} from '../src/index.js';
import { seededGurmukhi } from './util.js';

describe('tokenize', () => {
  it('records offsets into the original and never copies whitespace', () => {
    const s = ' ਸਤਿ  ਨਾਮੁ\tਕਰਤਾ ॥ ';
    const toks = tokenize(s);
    expect(toks.map((t) => tokenText(s, t))).toEqual(['ਸਤਿ', 'ਨਾਮੁ', 'ਕਰਤਾ', '॥']);
    expect(toks.map((t) => t.ordinal)).toEqual([0, 1, 2, 3]);
  });
  it('is the identity when reassembled with the original gaps (fixtures + random)', () => {
    const rnd = seededGurmukhi(7);
    for (let i = 0; i < 2000; i++) {
      const s = rnd(1 + (i % 60));
      const toks = tokenize(s);
      let rebuilt = '';
      let pos = 0;
      for (const t of toks) {
        rebuilt += cpSlice(s, pos, t.cpStart) + cpSlice(s, t.cpStart, t.cpEnd);
        pos = t.cpEnd;
      }
      rebuilt += cpSlice(s, pos, codepointLength(s));
      expect(rebuilt).toBe(s);
    }
  });
  it('larivaar view is presentation-only and maps offsets back to tokens', () => {
    const s = 'ਸਤਿ ਨਾਮੁ ਕਰਤਾ';
    const toks = tokenize(s);
    const v = larivaarView(s, toks);
    expect(v.joined).toBe('ਸਤਿਨਾਮੁਕਰਤਾ');
    expect(Array.from(v.ownerByOffset)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]); // ਕਰਤਾ = 4 codepoints
    expect(s).toBe('ਸਤਿ ਨਾਮੁ ਕਰਤਾ'); // untouched
  });
  it('snapToTokens widens a sub-word range to whole tokens', () => {
    const s = 'ਸਤਿ ਨਾਮੁ ਕਰਤਾ';
    const toks = tokenize(s);
    expect(snapToTokens(toks, 1, 2)).toEqual({ first: 0, last: 0 });
    expect(snapToTokens(toks, 2, 6)).toEqual({ first: 0, last: 1 });
    expect(snapToTokens(toks, 3, 4)).toBeNull(); // pure whitespace selection
  });
});
