/**
 * First-letter search keys (STTM / BaniDB style).  A DERIVED index value, never stored as text.
 * For each token, the first codepoint that is a letter (consonant, independent vowel, Ik Onkar)
 * is taken; precomposed nukta letters map to their base so ਸ਼ and ਸ share a key.
 */
import { isLetter, toCodepoints, fromCodepoints } from './codepoints.js';
import { normalizeEncoding } from './normalize.js';
import { tokenize, tokenText } from './tokenize.js';

export function firstLetters(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(text)) {
    const cps = toCodepoints(normalizeEncoding(tokenText(text, t)));
    const first = cps.find(isLetter);
    if (first !== undefined) out.push(fromCodepoints([first]));
  }
  return out;
}

export function firstLetterKey(text: string): string {
  return firstLetters(text).join('');
}
