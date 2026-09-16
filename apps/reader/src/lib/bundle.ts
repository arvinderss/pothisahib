/**
 * Bundle integrity verification (RISK_REGISTER R-23). A bundle is stored or rendered only after
 * every line hash and the bundle hash have been recomputed and matched. Uses Web Crypto so the
 * same code runs in the browser and in Node tests.
 */
import { bundleHashInput, isBundleShape, type Bundle } from '@pothisahib/domain';

const enc = new TextEncoder();

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type VerifyResult = { ok: true; bundle: Bundle } | { ok: false; reason: string };

/**
 * Web Crypto exists only in a secure context. A device loading the app over plain http on a local
 * network therefore cannot verify a bundle, and unverified text must never be stored or shown, so
 * the failure is reported as what it is rather than as a missing property.
 */
export function cryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === 'function';
}

export const INSECURE_CONTEXT_REASON =
  'this page is not a secure context, so the text cannot be verified; open it over https or on localhost';

export async function verifyBundle(candidate: unknown): Promise<VerifyResult> {
  if (!cryptoAvailable()) return { ok: false, reason: INSECURE_CONTEXT_REASON };
  if (!isBundleShape(candidate)) return { ok: false, reason: 'malformed bundle' };
  const b = candidate;
  for (const [i, line] of b.lines.entries()) {
    if (!line.text.isWellFormed())
      return { ok: false, reason: `line ${i}: text is not well-formed Unicode` };
    if ((await sha256Hex(line.text)) !== line.sha256)
      return { ok: false, reason: `line ${i}: text hash mismatch` };
    const cpLen = [...line.text].length;
    if (line.codepointCount !== cpLen)
      return { ok: false, reason: `line ${i}: codepoint count mismatch` };
    let prevEnd = 0;
    for (const [s, e] of line.tokens) {
      if (!(Number.isInteger(s) && Number.isInteger(e) && s >= prevEnd && e > s && e <= cpLen))
        return { ok: false, reason: `line ${i}: invalid token offsets` };
      prevEnd = e;
    }
  }
  const expected = await sha256Hex(bundleHashInput(b.lines.map((l) => l.sha256)));
  if (expected !== b.bundleSha256) return { ok: false, reason: 'bundle hash mismatch' };
  return { ok: true, bundle: b };
}
