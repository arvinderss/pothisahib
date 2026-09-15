import { BadRequestError } from '../errors.ts';
import {
  decodeUtf8Strict,
  type ParsedDocument,
  type ParsedLine,
  type ParsedSection,
  type Parser,
} from './types.ts';

/**
 * kosh-source/1 — the project's own structured interchange format, which per-source adapters
 * (BaniDB, Shabad OS, hand transcriptions) emit so that one parser handles structure for all.
 *
 * {
 *   "format": "kosh-source/1",
 *   "documents": [{
 *     "locator": "japji-sahib", "title": "…", "metadata": {…},
 *     "sections": [{ "type": "PAURI", "label": "1", "lines": [{ "text": "…", "locator": { "ang": 1 } }],
 *                    "sections": [ … nested … ] }]
 *   }]
 * }
 *
 * Validation is strict: unknown shapes are rejected rather than guessed at.
 */
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const optStr = (v: unknown, what: string, max = 500): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.length > max) throw new BadRequestError(`invalid ${what}`);
  return v;
};
const optMeta = (v: unknown, what: string): Record<string, unknown> | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) throw new BadRequestError(`invalid ${what}`);
  return v;
};

function parseLine(v: unknown, where: string): ParsedLine {
  if (!isObj(v) || typeof v['text'] !== 'string')
    throw new BadRequestError(`${where}: line must be {text: string}`);
  const out: ParsedLine = { text: v['text'] };
  const loc = optMeta(v['locator'], `${where}.locator`);
  if (loc) out.locator = loc;
  return out;
}

function parseSection(v: unknown, where: string, depth: number): ParsedSection {
  if (depth > 8) throw new BadRequestError(`${where}: section nesting too deep`);
  if (!isObj(v)) throw new BadRequestError(`${where}: section must be an object`);
  const type = v['type'];
  if (typeof type !== 'string' || !/^[A-Z][A-Z0-9_]{0,39}$/.test(type))
    throw new BadRequestError(`${where}: section.type must be UPPER_SNAKE`);
  const out: ParsedSection = { type };
  const label = optStr(v['label'], `${where}.label`, 200);
  if (label !== undefined) out.label = label;
  const meta = optMeta(v['metadata'], `${where}.metadata`);
  if (meta) out.metadata = meta;
  if (v['lines'] !== undefined) {
    if (!Array.isArray(v['lines'])) throw new BadRequestError(`${where}.lines must be an array`);
    out.lines = v['lines'].map((l, i) => parseLine(l, `${where}.lines[${i}]`));
  }
  if (v['sections'] !== undefined) {
    if (!Array.isArray(v['sections']))
      throw new BadRequestError(`${where}.sections must be an array`);
    out.sections = v['sections'].map((s, i) =>
      parseSection(s, `${where}.sections[${i}]`, depth + 1),
    );
  }
  if (!out.lines && !out.sections)
    throw new BadRequestError(`${where}: section has neither lines nor sections`);
  return out;
}

export const koshSourceV1Parser: Parser = {
  format: 'kosh-source-v1',
  version: 'kosh-parse-kosh-source/1.0.0',
  parse(bytes: Uint8Array): ParsedDocument[] {
    let root: unknown;
    try {
      root = JSON.parse(decodeUtf8Strict(bytes));
    } catch {
      throw new BadRequestError('artefact is not valid UTF-8 JSON');
    }
    if (!isObj(root) || root['format'] !== 'kosh-source/1')
      throw new BadRequestError('format must be "kosh-source/1"');
    if (!Array.isArray(root['documents']) || root['documents'].length === 0)
      throw new BadRequestError('documents must be a non-empty array');
    const seen = new Set<string>();
    return root['documents'].map((d, i) => {
      const where = `documents[${i}]`;
      if (!isObj(d)) throw new BadRequestError(`${where} must be an object`);
      const locator = d['locator'];
      if (typeof locator !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(locator))
        throw new BadRequestError(`${where}.locator invalid`);
      if (seen.has(locator))
        throw new BadRequestError(`${where}.locator duplicates an earlier document`);
      seen.add(locator);
      if (!Array.isArray(d['sections']) || d['sections'].length === 0)
        throw new BadRequestError(`${where}.sections must be a non-empty array`);
      const doc: ParsedDocument = {
        locator,
        sections: d['sections'].map((s, j) => parseSection(s, `${where}.sections[${j}]`, 0)),
      };
      const title = optStr(d['title'], `${where}.title`);
      if (title !== undefined) doc.title = title;
      const meta = optMeta(d['metadata'], `${where}.metadata`);
      if (meta) doc.metadata = meta;
      return doc;
    });
  },
};
