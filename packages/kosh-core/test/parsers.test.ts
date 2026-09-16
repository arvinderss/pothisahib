import { describe, expect, it } from 'vitest';
import {
  flattenDocument,
  inputFromBytes,
  koshSourceV1Parser,
  txtParser,
  FsObjectStore,
  keyFor,
} from '../src/index.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, koshSourceDocument, SAMPLE_LINES } from '../src/testing.ts';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const parseTxt = (b: Uint8Array) => txtParser.parse(inputFromBytes(b));
const parseKosh = (b: Uint8Array) => koshSourceV1Parser.parse(inputFromBytes(b));

describe('txt parser', () => {
  it('preserves every line exactly, including blank lines, and records the newline style', async () => {
    const lines = [
      ...FIXTURES.recover_cases.filter((s) => !s.includes('\n')),
      '',
      ' ',
      'ਸਤਿ  ਨਾਮੁ ',
    ];
    for (const nl of ['\n', '\r\n']) {
      const docs = await parseTxt(enc(lines.join(nl) + nl));
      const flat = flattenDocument(docs[0] as never);
      expect(flat.map((l) => l.text)).toEqual(lines);
      expect(docs[0]?.metadata?.['newline_style']).toBe(nl === '\n' ? 'LF' : 'CRLF');
    }
  });
  it('rejects invalid UTF-8 rather than repairing it', async () => {
    await expect(parseTxt(Uint8Array.from([0xe0, 0xa8, 0xff, 0x0a]))).rejects.toThrow();
  });
  it('a BOM is kept as text, never stripped silently', async () => {
    const flat = flattenDocument((await parseTxt(enc('﻿ਸਤਿ\n')))[0] as never);
    expect(flat[0]?.text).toBe('﻿ਸਤਿ');
  });
});

describe('kosh-source/1 parser', () => {
  it('parses nested sections and flattens with section paths', async () => {
    const docs = await parseKosh(koshSourceDocument('d', SAMPLE_LINES));
    const flat = flattenDocument(docs[0] as never);
    expect(flat.map((l) => l.text)).toEqual(SAMPLE_LINES);
    expect(flat[0]?.sectionPath).toEqual([{ type: 'PAURI', label: '1' }]);
    expect(flat[flat.length - 1]?.sectionPath).toEqual([
      { type: 'PAURI', label: '2' },
      { type: 'SALOK', label: null },
    ]);
  });
  it('is strict about shape', async () => {
    const bad = (o: unknown): Promise<void> =>
      expect(parseKosh(enc(JSON.stringify(o)))).rejects.toThrow();
    await bad({ format: 'other', documents: [] });
    await bad({ format: 'kosh-source/1', documents: [] });
    await bad({ format: 'kosh-source/1', documents: [{ locator: 'a', sections: [] }] });
    await bad({
      format: 'kosh-source/1',
      documents: [{ locator: 'a', sections: [{ type: 'lower', lines: [{ text: 'x' }] }] }],
    });
    await bad({
      format: 'kosh-source/1',
      documents: [{ locator: 'a', sections: [{ type: 'BODY', lines: [{ text: 1 }] }] }],
    });
    await bad({
      format: 'kosh-source/1',
      documents: [{ locator: 'a', sections: [{ type: 'BODY' }] }],
    });
    await bad({
      format: 'kosh-source/1',
      documents: [
        { locator: 'a', sections: [{ type: 'BODY', lines: [] }] },
        { locator: 'a', sections: [{ type: 'BODY', lines: [] }] },
      ],
    });
    await expect(parseKosh(enc('not json'))).rejects.toThrow(/UTF-8 JSON/);
  });
});

describe('filesystem object store', () => {
  it('is content-addressed, idempotent, integrity-checked and traversal-safe', async () => {
    const store = new FsObjectStore(mkdtempSync(join(tmpdir(), 'kosh-store-')));
    const bytes = enc('ਸਤਿ ਨਾਮੁ');
    const k1 = await store.put(bytes);
    const k2 = await store.put(bytes);
    expect(k1).toBe(k2);
    expect(k1).toBe(keyFor(bytes));
    expect(Buffer.from(await store.get(k1)).equals(Buffer.from(bytes))).toBe(true);
    expect(await store.exists(k1)).toBe(true);
    expect(await store.localPath(k1)).toMatch(/[0-9a-f]{64}$/);
    expect(await store.localPath('snapshots/' + 'e'.repeat(64))).toBeNull();
    await expect(store.get('../../etc/passwd')).rejects.toThrow(/invalid storage key/);
    await expect(store.get('snapshots/' + 'f'.repeat(64))).rejects.toThrow();
  });
});
