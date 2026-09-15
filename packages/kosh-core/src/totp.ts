/**
 * RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits) with RFC 4648 base32, implemented on
 * node:crypto so no third-party dependency handles authenticator secrets. Verified against the
 * RFC 6238 Appendix B test vectors in test/totp.test.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
}

export function hotp(
  secret: Uint8Array,
  counter: bigint,
  digits = 6,
  algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1',
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const bin =
    (((mac[offset] as number) & 0x7f) << 24) |
    (((mac[offset + 1] as number) & 0xff) << 16) |
    (((mac[offset + 2] as number) & 0xff) << 8) |
    ((mac[offset + 3] as number) & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpAt(secret: Uint8Array, unixSeconds: number, opts: TotpOptions = {}): string {
  const period = opts.period ?? 30;
  return hotp(
    secret,
    BigInt(Math.floor(unixSeconds / period)),
    opts.digits ?? 6,
    opts.algorithm ?? 'sha1',
  );
}

export function totpNow(secret: Uint8Array, opts: TotpOptions = {}): string {
  return totpAt(secret, Date.now() / 1000, opts);
}

/** Accept the current step and one step either side (clock skew), constant-time compare. */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  unixSeconds = Date.now() / 1000,
  opts: TotpOptions = {},
): boolean {
  if (!/^[0-9]{6,8}$/.test(code)) return false;
  const period = opts.period ?? 30;
  for (const skew of [0, -1, 1]) {
    const expected = totpAt(secret, unixSeconds + skew * period, opts);
    if (
      expected.length === code.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(code))
    )
      return true;
  }
  return false;
}

export function generateTotpSecret(bytes = 20): Buffer {
  return randomBytes(bytes);
}

export function otpauthUri(issuer: string, account: string, secret: Uint8Array): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
