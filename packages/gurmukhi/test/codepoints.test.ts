import { describe, expect, it } from 'vitest';
import {
  classify,
  toCodepoints,
  fromCodepoints,
  cpSlice,
  codepointLength,
  isCombining,
} from '../src/index.js';

describe('classify', () => {
  it('classifies every mark type distinctly', () => {
    expect(classify(0x0a41)).toBe('VOWEL_SIGN'); // ੁ
    expect(classify(0x0a42)).toBe('VOWEL_SIGN'); // ੂ
    expect(classify(0x0a02)).toBe('BINDI');
    expect(classify(0x0a70)).toBe('TIPPI');
    expect(classify(0x0a71)).toBe('ADDAK');
    expect(classify(0x0a03)).toBe('VISARGA');
    expect(classify(0x0a3c)).toBe('NUKTA');
    expect(classify(0x0a4d)).toBe('VIRAMA');
    expect(classify(0x0a74)).toBe('IK_ONKAR');
    expect(classify(0x0965)).toBe('DANDA');
    expect(classify(0x200c)).toBe('FORMAT');
    expect(classify(0x0a)).toBe('LINE_BREAK');
    expect(classify(0xa0)).toBe('WHITESPACE');
  });
  it('treats precomposed nukta letters as consonants', () => {
    for (const cp of [0x0a33, 0x0a36, 0x0a59, 0x0a5a, 0x0a5b, 0x0a5e])
      expect(classify(cp)).toBe('CONSONANT');
  });
  it('marks are combining, bases are not', () => {
    expect(isCombining(0x0a3e)).toBe(true);
    expect(isCombining(0x0a15)).toBe(false);
  });
});

describe('codepoint helpers are lossless', () => {
  const samples = ['ਸਤਿਗੁਰੁ', 'ੴ', 'a\u{1F600}b', '', 'ਗੁ‌ਰ', 'ਿਸ'];
  it('toCodepoints ∘ fromCodepoints is identity', () => {
    for (const s of samples) expect(fromCodepoints(toCodepoints(s))).toBe(s);
  });
  it('cpSlice returns exact subsequences and full slice equals input', () => {
    for (const s of samples) expect(cpSlice(s, 0, codepointLength(s))).toBe(s);
    expect(cpSlice('ਸਤਿਗੁਰੁ', 2, 4)).toBe('ਿਗ');
  });
});
