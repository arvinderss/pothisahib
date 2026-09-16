import type { SnapshotFormat } from '@pothisahib/domain';
import { BadRequestError } from '../errors.ts';
import { koshSourceV1Parser } from './kosh-source-v1.ts';
import { shabadosSqliteV1Parser } from './shabados-sqlite-v1.ts';
import { txtParser } from './txt.ts';
import type { Parser } from './types.ts';

const PARSERS: Record<SnapshotFormat, Parser> = {
  txt: txtParser,
  'kosh-source-v1': koshSourceV1Parser,
  'shabados-sqlite-v1': shabadosSqliteV1Parser,
};

export function parserFor(format: string): Parser {
  const p = (PARSERS as Record<string, Parser | undefined>)[format];
  if (!p) throw new BadRequestError(`unknown input format: ${format}`);
  return p;
}

export * from './types.ts';
export { txtParser, koshSourceV1Parser, shabadosSqliteV1Parser };
export { separateVishraam, type Vishraam, type VishraamKind } from './shabados-sqlite-v1.ts';
