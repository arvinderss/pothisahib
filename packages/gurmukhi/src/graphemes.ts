/**
 * Deterministic Gurmukhi grapheme-cluster segmentation.
 *
 * We do NOT use Intl.Segmenter: its behaviour for Indic conjuncts varies with the ICU version
 * bundled in each runtime, and the Python port must produce identical clusters.  Rules:
 *   1. A cluster begins at any non-combining codepoint (the "base").
 *   2. It absorbs every following combining mark (matra, nukta, virama, bindi, tippi, addak,
 *      visarga, udaat, yakash, and invisible format characters).
 *   3. If a VIRAMA was absorbed and the next codepoint is a CONSONANT, that consonant joins the
 *      cluster (conjuncts such as ੍ਹ ੍ਰ ੍ਵ), and absorption continues.
 *   4. A leading orphan combining mark (no base) forms its own cluster — it is preserved, never
 *      dropped or reattached.
 *
 * Invariant: concatenating the clusters in order reproduces the input byte-for-byte.
 */
import { classify, isCombining, toCodepoints } from './codepoints.js';

export interface Span {
  /** inclusive codepoint offset */
  cpStart: number;
  /** exclusive codepoint offset */
  cpEnd: number;
}

export function segmentGraphemes(text: string): Span[] {
  const cps = toCodepoints(text);
  const out: Span[] = [];
  let i = 0;
  while (i < cps.length) {
    const start = i;
    i++; // base (or orphan mark)
    let sawVirama = false;
    while (i < cps.length) {
      const cp = cps[i] as number;
      if (isCombining(cp)) {
        if (classify(cp) === 'VIRAMA') sawVirama = true;
        i++;
        continue;
      }
      if (sawVirama && classify(cp) === 'CONSONANT') {
        sawVirama = false;
        i++;
        continue;
      }
      break;
    }
    out.push({ cpStart: start, cpEnd: i });
  }
  return out;
}

export function graphemeCount(text: string): number {
  return segmentGraphemes(text).length;
}
