import { describe, expect, it } from 'vitest';
import {
  normalizeEncoding,
  normalizeForComparison,
  skeleton,
  firstLetterKey,
  firstLetters,
} from '../src/index.js';

describe('normalisation produces a SEPARATE representation', () => {
  it('encoding-v1 equates precomposed and decomposed nukta and drops ZWNJ', () => {
    expect(normalizeEncoding('\u0a36ਬਦ')).toBe(normalizeEncoding('\u0a38\u0a3cਬਦ'));
    expect(normalizeEncoding('ਗੁ‌ਰ')).toBe('ਗੁਰ');
  });
  it('compare-v1 canonicalises whitespace only', () => {
    expect(normalizeForComparison('  ਸਤਿ   ਨਾਮੁ\n')).toBe('ਸਤਿ ਨਾਮੁ');
    expect(normalizeForComparison('ਸਤਿਗੁਰੁ')).toBe('ਸਤਿਗੁਰੁ'); // marks untouched
  });
  it('skeleton-v1 strips all dependent marks', () => {
    expect(skeleton('ਸਤਿਗੁਰੁ ਪ੍ਰਸਾਦਿ')).toBe('ਸਤਗਰ ਪਰਸਦ');
  });
  it('never changes the input value', () => {
    const s = 'ਸ਼ਬਦ  ਗੁ‌ਰ';
    normalizeEncoding(s);
    normalizeForComparison(s);
    skeleton(s);
    expect(s).toBe('ਸ਼ਬਦ  ਗੁ‌ਰ');
  });
});

describe('first-letter keys', () => {
  it('takes the first letter of each token, skipping punctuation', () => {
    expect(firstLetters('ਸਤਿਗੁਰੁ ਨੋ ਸਬਦੁ ॥੧॥')).toEqual(['ਸ', 'ਨ', 'ਸ']);
    expect(firstLetterKey('ੴ ਸਤਿ ਨਾਮੁ')).toBe('ੴਸਨ');
  });
  it('maps precomposed nukta letters to the base letter', () => {
    expect(firstLetterKey('\u0a36ਬਦ')).toBe('ਸ');
  });
});
