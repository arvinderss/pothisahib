/**
 * THE SINGLE SANCTIONED NORMALISATION MODULE.
 *
 * Nothing in this repository may normalise Unicode except this file (enforced by ESLint and by
 * scripts/check-no-normalize.mjs).  The functions here produce a SEPARATE comparison
 * representation.  They must never be applied to text that is about to be stored as a source or
 * accepted reading; callers that need equality on raw text compare raw bytes.
 *
 * We deliberately do NOT use String.prototype.normalize / NFC.  Gurmukhi's only canonical
 * equivalences are six precomposed nukta letters, all of which are composition-excluded in
 * Unicode, so NFC behaviour is counter-intuitive and runtime-dependent.  An explicit table is
 * deterministic and trivially portable to Python.
 */
import { classify, toCodepoints, fromCodepoints } from './codepoints.js';

export type NormalizationProfile = 'encoding-v1' | 'compare-v1' | 'skeleton-v1';

/** Precomposed nukta letters → base consonant + NUKTA (U+0A3C). */
const DECOMPOSE: ReadonlyMap<number, readonly number[]> = new Map([
  [0x0a33, [0x0a32, 0x0a3c]], // ਲ਼
  [0x0a36, [0x0a38, 0x0a3c]], // ਸ਼
  [0x0a59, [0x0a16, 0x0a3c]], // ਖ਼
  [0x0a5a, [0x0a17, 0x0a3c]], // ਗ਼
  [0x0a5b, [0x0a1c, 0x0a3c]], // ਜ਼
  [0x0a5e, [0x0a2b, 0x0a3c]], // ਫ਼
]);

/**
 * encoding-v1: two strings that render identically compare equal.
 *   - precomposed nukta letters decomposed
 *   - invisible format characters (ZWJ/ZWNJ/ZWSP/WJ/BOM) removed
 * Nothing else changes.  Whitespace and every mark are retained.
 */
export function normalizeEncoding(text: string): string {
  const out: number[] = [];
  for (const cp of toCodepoints(text)) {
    const d = DECOMPOSE.get(cp);
    if (d) out.push(...d);
    else if (classify(cp) !== 'FORMAT') out.push(cp);
  }
  return fromCodepoints(out);
}

/**
 * compare-v1: encoding-v1 plus whitespace canonicalisation — every run of whitespace/line
 * breaks becomes a single U+0020 and leading/trailing whitespace is removed.  Used for
 * line-level matching across sources whose spacing conventions differ.
 */
export function normalizeForComparison(text: string): string {
  const cps = toCodepoints(normalizeEncoding(text));
  const out: number[] = [];
  let pendingSpace = false;
  for (const cp of cps) {
    const c = classify(cp);
    if (c === 'WHITESPACE' || c === 'LINE_BREAK') {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) out.push(0x20);
    pendingSpace = false;
    out.push(cp);
  }
  return fromCodepoints(out);
}

/**
 * skeleton-v1: compare-v1 with every dependent mark removed (matras, bindi, tippi, addak,
 * nukta, visarga, virama, udaat, yakash).  Only bases remain.  For fuzzy ALIGNMENT between
 * sources with orthographic variation.  Never used for equality decisions a human has not seen.
 */
export function skeleton(text: string): string {
  const out: number[] = [];
  for (const cp of toCodepoints(normalizeForComparison(text))) {
    switch (classify(cp)) {
      case 'VOWEL_SIGN':
      case 'NUKTA':
      case 'VIRAMA':
      case 'BINDI':
      case 'TIPPI':
      case 'ADDAK':
      case 'VISARGA':
      case 'ADAK_BINDI':
      case 'UDAAT':
      case 'YAKASH':
        continue;
      default:
        out.push(cp);
    }
  }
  return fromCodepoints(out);
}

export function normalize(text: string, profile: NormalizationProfile): string {
  switch (profile) {
    case 'encoding-v1':
      return normalizeEncoding(text);
    case 'compare-v1':
      return normalizeForComparison(text);
    case 'skeleton-v1':
      return skeleton(text);
  }
}

/** Version string recorded in source_normalizations.normalizer_version. */
export const NORMALIZER_VERSION = 'gurmukhi-normalize/1.0.0';
