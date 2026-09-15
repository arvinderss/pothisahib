import { decodeUtf8Strict, type ParsedDocument, type Parser } from './types.ts';

/**
 * Plain UTF-8 text: one source line per physical line. CRLF and LF both terminate a line; the
 * terminator itself is not part of the line text (it is recorded as `newline_style` metadata so
 * the artefact is still fully described). A trailing terminator does not create an extra empty
 * line. Blank lines ARE lines — the source put them there.
 */
export const txtParser: Parser = {
  format: 'txt',
  version: 'kosh-parse-txt/1.0.0',
  parse(bytes: Uint8Array): ParsedDocument[] {
    const text = decodeUtf8Strict(bytes);
    const crlf = text.includes('\r\n');
    const parts = text.split(/\r\n|\n/);
    if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return [
      {
        locator: 'text',
        metadata: { newline_style: crlf ? 'CRLF' : 'LF' },
        sections: [{ type: 'BODY', lines: parts.map((p) => ({ text: p })) }],
      },
    ];
  },
};
