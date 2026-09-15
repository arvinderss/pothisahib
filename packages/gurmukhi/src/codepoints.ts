/**
 * Gurmukhi codepoint classification.
 *
 * Everything in this package works in **Unicode codepoints**, never UTF-16 code units, so that
 * offsets are stable across JavaScript, Python and PostgreSQL.  Nothing here ever changes a
 * codepoint; classification is read-only.
 */

export type CodepointCategory =
  | 'CONSONANT'
  | 'INDEPENDENT_VOWEL'
  | 'VOWEL_SIGN' // matra (lagā-mātrā)
  | 'NUKTA' // ਼ U+0A3C
  | 'VIRAMA' // ੍ U+0A4D (halant)
  | 'BINDI' // ਂ U+0A02
  | 'TIPPI' // ੰ U+0A70
  | 'ADDAK' // ੱ U+0A71
  | 'VISARGA' // ਃ U+0A03
  | 'ADAK_BINDI' // ਁ U+0A01
  | 'UDAAT' // ੑ U+0A51
  | 'YAKASH' // ੵ U+0A75
  | 'IK_ONKAR' // ੴ U+0A74
  | 'ABBREVIATION' // ੶ U+0A76
  | 'DIGIT'
  | 'DANDA' // । ॥ (Devanagari block, used in Gurmukhi)
  | 'PUNCTUATION'
  | 'WHITESPACE'
  | 'LINE_BREAK'
  | 'FORMAT' // ZWJ / ZWNJ / ZWSP and similar invisible format characters
  | 'OTHER';

const inRange = (cp: number, lo: number, hi: number): boolean => cp >= lo && cp <= hi;

/** Classify a single Unicode codepoint. Pure; total; deterministic. */
export function classify(cp: number): CodepointCategory {
  // Line breaks first so they are never swallowed as generic whitespace.
  if (cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029 || cp === 0x85)
    return 'LINE_BREAK';
  if (
    cp === 0x20 ||
    cp === 0x09 ||
    cp === 0xa0 ||
    cp === 0x3000 ||
    inRange(cp, 0x2000, 0x200a) ||
    cp === 0x202f ||
    cp === 0x205f
  )
    return 'WHITESPACE';
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff)
    return 'FORMAT';

  // Gurmukhi block U+0A00–U+0A7F
  if (cp === 0x0a01) return 'ADAK_BINDI';
  if (cp === 0x0a02) return 'BINDI';
  if (cp === 0x0a03) return 'VISARGA';
  if (inRange(cp, 0x0a05, 0x0a0a) || inRange(cp, 0x0a0f, 0x0a10) || inRange(cp, 0x0a13, 0x0a14))
    return 'INDEPENDENT_VOWEL';
  if (
    inRange(cp, 0x0a15, 0x0a28) ||
    inRange(cp, 0x0a2a, 0x0a30) ||
    inRange(cp, 0x0a32, 0x0a33) ||
    inRange(cp, 0x0a35, 0x0a36) ||
    inRange(cp, 0x0a38, 0x0a39)
  )
    return 'CONSONANT';
  if (cp === 0x0a3c) return 'NUKTA';
  if (inRange(cp, 0x0a3e, 0x0a42) || inRange(cp, 0x0a47, 0x0a48) || inRange(cp, 0x0a4b, 0x0a4c))
    return 'VOWEL_SIGN';
  if (cp === 0x0a4d) return 'VIRAMA';
  if (cp === 0x0a51) return 'UDAAT';
  if (inRange(cp, 0x0a59, 0x0a5c) || cp === 0x0a5e) return 'CONSONANT'; // ਖ਼ ਗ਼ ਜ਼ ੜ ਫ਼
  if (inRange(cp, 0x0a66, 0x0a6f)) return 'DIGIT';
  if (cp === 0x0a70) return 'TIPPI';
  if (cp === 0x0a71) return 'ADDAK';
  if (inRange(cp, 0x0a72, 0x0a73)) return 'CONSONANT'; // ੲ ੳ (iri, ura) — letter bases
  if (cp === 0x0a74) return 'IK_ONKAR';
  if (cp === 0x0a75) return 'YAKASH';
  if (cp === 0x0a76) return 'ABBREVIATION';

  if (cp === 0x0964 || cp === 0x0965) return 'DANDA';
  if (inRange(cp, 0x30, 0x39)) return 'DIGIT';
  // ASCII + general punctuation
  if (
    inRange(cp, 0x21, 0x2f) ||
    inRange(cp, 0x3a, 0x40) ||
    inRange(cp, 0x5b, 0x60) ||
    inRange(cp, 0x7b, 0x7e)
  )
    return 'PUNCTUATION';
  if (inRange(cp, 0x2010, 0x2027) || inRange(cp, 0x2030, 0x205e)) return 'PUNCTUATION';
  return 'OTHER';
}

/** Marks that attach to a preceding base and therefore never begin a grapheme cluster. */
export function isCombining(cp: number): boolean {
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
    case 'FORMAT':
      return true;
    default:
      return false;
  }
}

/** Letters that can carry a first-letter search key. */
export function isLetter(cp: number): boolean {
  const c = classify(cp);
  return c === 'CONSONANT' || c === 'INDEPENDENT_VOWEL' || c === 'IK_ONKAR';
}

export function isWhitespaceOrBreak(cp: number): boolean {
  const c = classify(cp);
  return c === 'WHITESPACE' || c === 'LINE_BREAK';
}

/** Split a string into an array of codepoints (not UTF-16 units). Lossless. */
export function toCodepoints(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) out.push(ch.codePointAt(0) as number);
  return out;
}

/** Inverse of toCodepoints. Lossless. */
export function fromCodepoints(cps: readonly number[]): string {
  // Chunk to avoid argument-length limits on very long inputs.
  let s = '';
  for (let i = 0; i < cps.length; i += 4096) s += String.fromCodePoint(...cps.slice(i, i + 4096));
  return s;
}

/** Number of codepoints in a string. */
export function codepointLength(text: string): number {
  return toCodepoints(text).length;
}

/** Slice by codepoint offsets [start, end). Returns the exact original subsequence. */
export function cpSlice(text: string, start: number, end: number): string {
  return fromCodepoints(toCodepoints(text).slice(start, end));
}
