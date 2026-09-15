/**
 * Offset-based tokenisation.
 *
 * A token is a maximal run of codepoints that are neither whitespace nor line breaks.  Tokens are
 * recorded as codepoint offset ranges into the ORIGINAL text; the text itself is never copied,
 * trimmed or altered.  The gaps between tokens (whitespace, breaks) are therefore preserved
 * implicitly and `detokenize` is the identity on the original.
 *
 * This is the only tokenisation rule used for SOURCE_SPACING layouts.  It does not attempt to
 * split punctuation from words: a source's own segmentation is a fact to be preserved, not
 * improved (see docs/RISK_REGISTER.md R-07).
 */
import { isWhitespaceOrBreak, toCodepoints, fromCodepoints } from './codepoints.js';
import type { Span } from './graphemes.js';

export interface Token extends Span {
  ordinal: number;
}

export function tokenize(text: string): Token[] {
  const cps = toCodepoints(text);
  const tokens: Token[] = [];
  let i = 0;
  while (i < cps.length) {
    while (i < cps.length && isWhitespaceOrBreak(cps[i] as number)) i++;
    if (i >= cps.length) break;
    const start = i;
    while (i < cps.length && !isWhitespaceOrBreak(cps[i] as number)) i++;
    tokens.push({ ordinal: tokens.length, cpStart: start, cpEnd: i });
  }
  return tokens;
}

/** Text of one token, sliced from the original — never re-synthesised. */
export function tokenText(text: string, token: Span): string {
  return fromCodepoints(toCodepoints(text).slice(token.cpStart, token.cpEnd));
}

/**
 * Presentation-only Larivaar join: tokens concatenated with no separators.  This is a VIEW of
 * the tokens; the underlying text and layout are untouched.  Returns the joined string and a
 * map from joined-codepoint-offset to token ordinal for hit-testing.
 */
export function larivaarView(
  text: string,
  tokens: readonly Token[],
): { joined: string; ownerByOffset: Uint32Array } {
  const cps = toCodepoints(text);
  const outCps: number[] = [];
  const owners: number[] = [];
  for (const t of tokens) {
    for (let i = t.cpStart; i < t.cpEnd; i++) {
      outCps.push(cps[i] as number);
      owners.push(t.ordinal);
    }
  }
  return { joined: fromCodepoints(outCps), ownerByOffset: Uint32Array.from(owners) };
}

/** Snap an arbitrary codepoint range onto whole tokens (docs/RISK_REGISTER.md R-10). */
export function snapToTokens(
  tokens: readonly Token[],
  cpStart: number,
  cpEnd: number,
): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  for (const t of tokens) {
    if (t.cpEnd > cpStart && t.cpStart < cpEnd) {
      if (first < 0) first = t.ordinal;
      last = t.ordinal;
    }
  }
  return first < 0 ? null : { first, last };
}
