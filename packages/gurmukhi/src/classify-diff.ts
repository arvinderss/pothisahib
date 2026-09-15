/**
 * Codepoint-level diff between two readings of the same line, with each change classified into
 * the categories the Variance Explorer filters on.  Pure: never modifies either input.
 */
import { classify, toCodepoints, type CodepointCategory } from './codepoints.js';
import { normalizeEncoding } from './normalize.js';

export type DiffKind =
  | 'CHAR' // base letter / digit / other visible non-mark
  | 'MATRA' // dependent vowel sign
  | 'BINDI_TIPPI' // ਂ ੰ ਁ
  | 'VISARG'
  | 'NUKTA'
  | 'ADDAK'
  | 'CONJUNCT_MARK' // virama / udaat / yakash
  | 'PUNCT' // dandas and punctuation
  | 'WHITESPACE' // amount or type of whitespace changed, boundaries unchanged
  | 'WORD_BOUNDARY' // whitespace inserted or removed between visible characters
  | 'LINE_BREAK'
  | 'FORMAT' // ZWJ/ZWNJ/ZWSP only
  | 'ENCODING' // different codepoints, identical rendering (precomposed vs decomposed nukta)
  | 'MIXED';

export interface DiffFinding {
  kind: DiffKind;
  /** codepoint span in `a` that was removed (may be empty) */
  a: { cpStart: number; cpEnd: number };
  /** codepoint span in `b` that was inserted (may be empty) */
  b: { cpStart: number; cpEnd: number };
  removed: string;
  inserted: string;
}

function mapCategory(c: CodepointCategory): DiffKind {
  switch (c) {
    case 'VOWEL_SIGN':
      return 'MATRA';
    case 'BINDI':
    case 'TIPPI':
    case 'ADAK_BINDI':
      return 'BINDI_TIPPI';
    case 'VISARGA':
      return 'VISARG';
    case 'NUKTA':
      return 'NUKTA';
    case 'ADDAK':
      return 'ADDAK';
    case 'VIRAMA':
    case 'UDAAT':
    case 'YAKASH':
      return 'CONJUNCT_MARK';
    case 'DANDA':
    case 'PUNCTUATION':
      return 'PUNCT';
    case 'WHITESPACE':
      return 'WHITESPACE';
    case 'LINE_BREAK':
      return 'LINE_BREAK';
    case 'FORMAT':
      return 'FORMAT';
    default:
      return 'CHAR';
  }
}

/** Longest-common-subsequence edit script over codepoint arrays (a: removed, b: inserted). */
function editScript(
  a: readonly number[],
  b: readonly number[],
): Array<{ ai: number; bi: number; op: 'eq' | 'del' | 'ins' }> {
  const n = a.length;
  const m = b.length;
  // DP table of LCS lengths; lines are short so O(n·m) is acceptable. Guard pathological input.
  if (n * m > 4_000_000) throw new Error('classifyDiff: inputs too long for exact diff');
  const L: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) L.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = L[i] as Uint32Array;
      const next = L[i + 1] as Uint32Array;
      row[j] =
        a[i] === b[j]
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number);
    }
  }
  const script: Array<{ ai: number; bi: number; op: 'eq' | 'del' | 'ins' }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      script.push({ ai: i, bi: j, op: 'eq' });
      i++;
      j++;
    } else if (
      ((L[i + 1] as Uint32Array)[j] as number) >= ((L[i] as Uint32Array)[j + 1] as number)
    ) {
      script.push({ ai: i, bi: j, op: 'del' });
      i++;
    } else {
      script.push({ ai: i, bi: j, op: 'ins' });
      j++;
    }
  }
  while (i < n) script.push({ ai: i++, bi: j, op: 'del' });
  while (j < m) script.push({ ai: i, bi: j++, op: 'ins' });
  return script;
}

function isWs(c: CodepointCategory): boolean {
  return c === 'WHITESPACE' || c === 'LINE_BREAK';
}

export function classifyDiff(aText: string, bText: string): DiffFinding[] {
  const a = toCodepoints(aText);
  const b = toCodepoints(bText);
  const script = editScript(a, b);
  const findings: DiffFinding[] = [];

  let k = 0;
  while (k < script.length) {
    if ((script[k] as { op: string }).op === 'eq') {
      k++;
      continue;
    }
    // Gather one contiguous hunk of non-eq operations.
    const aStart = (script[k] as { ai: number }).ai;
    const bStart = (script[k] as { bi: number }).bi;
    let aEnd = aStart;
    let bEnd = bStart;
    while (k < script.length && (script[k] as { op: string }).op !== 'eq') {
      const s = script[k] as { ai: number; bi: number; op: string };
      if (s.op === 'del') aEnd = s.ai + 1;
      if (s.op === 'ins') bEnd = s.bi + 1;
      k++;
    }
    const removed = a.slice(aStart, aEnd);
    const inserted = b.slice(bStart, bEnd);
    findings.push({
      kind: classifyHunk(a, b, aStart, aEnd, bStart, bEnd, removed, inserted),
      a: { cpStart: aStart, cpEnd: aEnd },
      b: { cpStart: bStart, cpEnd: bEnd },
      removed: String.fromCodePoint(...removed),
      inserted: String.fromCodePoint(...inserted),
    });
  }
  return findings;
}

function classifyHunk(
  a: readonly number[],
  b: readonly number[],
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  removed: readonly number[],
  inserted: readonly number[],
): DiffKind {
  const cats = [...removed, ...inserted].map(classify);
  if (cats.some((c) => c === 'LINE_BREAK')) return 'LINE_BREAK';

  // Same rendering, different codepoints.
  if (
    removed.length > 0 &&
    inserted.length > 0 &&
    normalizeEncoding(String.fromCodePoint(...removed)) ===
      normalizeEncoding(String.fromCodePoint(...inserted))
  ) {
    return cats.every((c) => c === 'FORMAT') ? 'FORMAT' : 'ENCODING';
  }

  if (cats.every(isWs)) {
    // Pure whitespace change. Did it create/remove a word boundary?
    if (removed.length === 0 || inserted.length === 0) {
      const src = removed.length === 0 ? b : a;
      const start = removed.length === 0 ? bStart : aStart;
      const end = removed.length === 0 ? bEnd : aEnd;
      const before = start > 0 ? classify(src[start - 1] as number) : undefined;
      const after = end < src.length ? classify(src[end] as number) : undefined;
      if (before && after && !isWs(before) && !isWs(after)) return 'WORD_BOUNDARY';
    }
    return 'WHITESPACE';
  }

  const kinds = new Set(cats.map(mapCategory));
  kinds.delete('FORMAT'); // stray format chars accompanying a real change do not change its class
  if (kinds.size === 0) return 'FORMAT';
  if (kinds.size === 1) return [...kinds][0] as DiffKind;
  return 'MIXED';
}

/** Convenience: the set of kinds present between two readings, for filter indexing. */
export function diffKinds(aText: string, bText: string): Set<DiffKind> {
  return new Set(classifyDiff(aText, bText).map((f) => f.kind));
}
