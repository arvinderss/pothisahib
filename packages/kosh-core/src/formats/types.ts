/**
 * The parser output model. A source artefact yields documents; a document is a tree of sections
 * whose leaves carry lines EXACTLY as the source segmented them. Parsers never trim, join, split
 * or otherwise alter line text. (The one documented exception is the separation of a source's own
 * annotation layer from its text, recorded verbatim in the line locator; see ADR-0006.)
 */
export interface ParsedLine {
  text: string;
  /** Whatever the source used to address this line (ang, shabad id, page, verse) — recorded verbatim. */
  locator?: Record<string, unknown>;
}

export interface ParsedSection {
  type: string;
  label?: string;
  metadata?: Record<string, unknown>;
  sections?: ParsedSection[];
  lines?: ParsedLine[];
}

export interface ParsedDocument {
  locator: string;
  title?: string;
  metadata?: Record<string, unknown>;
  sections: ParsedSection[];
}

/** How a parser reaches the artefact: lazily as bytes, or (for large local files) by path. */
export interface ParserInput {
  bytes(): Promise<Uint8Array>;
  localPath: string | null;
}

export interface Parser {
  readonly format: string;
  readonly version: string;
  parse(input: ParserInput, options?: Record<string, unknown>): Promise<ParsedDocument[]>;
}

export function inputFromBytes(bytes: Uint8Array): ParserInput {
  return { bytes: async () => bytes, localPath: null };
}

/** Flattened line with the path of section (type,label) pairs from the document root. */
export interface FlatLine {
  ordinal: number;
  text: string;
  locator: Record<string, unknown>;
  sectionPath: { type: string; label: string | null }[];
}

export function flattenDocument(doc: ParsedDocument): FlatLine[] {
  const out: FlatLine[] = [];
  const walk = (s: ParsedSection, path: { type: string; label: string | null }[]): void => {
    const here = [...path, { type: s.type, label: s.label ?? null }];
    for (const l of s.lines ?? [])
      out.push({ ordinal: out.length, text: l.text, locator: l.locator ?? {}, sectionPath: here });
    for (const c of s.sections ?? []) walk(c, here);
  };
  for (const s of doc.sections) walk(s, []);
  return out;
}

export function decodeUtf8Strict(bytes: Uint8Array): string {
  // fatal: any invalid sequence is an error — we never silently repair source bytes
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
