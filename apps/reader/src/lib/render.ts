/**
 * Presentation segments for a line. The stored text is never changed: Pad Ched renders the exact
 * original including its whitespace; Larivaar renders the same tokens joined with nothing between
 * them (a true reading mode, not CSS hiding of spaces). Each word segment carries its ordinal so
 * later features (Shudh Roop selection) can address words.
 */
import { cpSlice, codepointLength } from '@pothisahib/gurmukhi';

export type Segment =
  { kind: 'word'; ordinal: number; text: string } | { kind: 'gap'; text: string };

export function segments(
  text: string,
  tokens: readonly [number, number][],
  mode: 'padched' | 'larivaar',
): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  tokens.forEach(([s, e], ordinal) => {
    if (mode === 'padched' && s > pos) out.push({ kind: 'gap', text: cpSlice(text, pos, s) });
    out.push({ kind: 'word', ordinal, text: cpSlice(text, s, e) });
    pos = e;
  });
  const total = codepointLength(text);
  if (mode === 'padched' && pos < total) out.push({ kind: 'gap', text: cpSlice(text, pos, total) });
  if (tokens.length === 0 && mode === 'padched' && text.length > 0) return [{ kind: 'gap', text }];
  return out;
}

/** Concatenating Pad Ched segments must reproduce the original text exactly. */
export function joinSegments(segs: readonly Segment[]): string {
  return segs.map((s) => s.text).join('');
}
