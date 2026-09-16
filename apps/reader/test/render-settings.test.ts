import { describe, expect, it } from 'vitest';
import { tokenize } from '@pothisahib/gurmukhi';
import { joinSegments, segments } from '../src/lib/render.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/lib/settings.ts';

const toks = (s: string): [number, number][] => tokenize(s).map((t) => [t.cpStart, t.cpEnd]);

describe('render segments', () => {
  it('Pad Ched reproduces the original text exactly, including odd whitespace', () => {
    for (const s of ['ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ॥', ' ਸਤਿ  ਨਾਮੁ ॥ ', '', '॥੧॥', 'ਸ਼ਬਦ ਸ਼ਬਦ']) {
      expect(joinSegments(segments(s, toks(s), 'padched'))).toBe(s);
    }
  });
  it('Larivaar joins words with nothing between and keeps ordinals for hit-testing', () => {
    const s = 'ਸਤਿ ਨਾਮੁ ਕਰਤਾ';
    const segs = segments(s, toks(s), 'larivaar');
    expect(joinSegments(segs)).toBe('ਸਤਿਨਾਮੁਕਰਤਾ');
    expect(segs.map((x) => (x.kind === 'word' ? x.ordinal : -1))).toEqual([0, 1, 2]);
    expect(s).toBe('ਸਤਿ ਨਾਮੁ ਕਰਤਾ'); // untouched
  });
});

describe('settings normalisation', () => {
  it('falls back to defaults and clamps out-of-range values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      normalizeSettings({
        theme: 'neon',
        fontScale: 99,
        lineHeight: 0,
        mode: 'x',
        showProvenance: 'no',
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      fontScale: 4,
      lineHeight: 1.2,
      showProvenance: true,
    });
    expect(
      normalizeSettings({ mode: 'larivaar', theme: 'sepia', showProvenance: false }).mode,
    ).toBe('larivaar');
  });
});
