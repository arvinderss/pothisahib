import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, totpAt, verifyTotp } from '../src/totp.ts';

// RFC 6238 Appendix B vectors (SHA-1, 8 digits, secret "12345678901234567890"); we compare the last 6.
const SECRET = Buffer.from('12345678901234567890', 'ascii');
const VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors', () => {
    for (const [t, code8] of VECTORS) {
      expect(totpAt(SECRET, t, { digits: 8 })).toBe(code8);
      expect(totpAt(SECRET, t)).toBe(code8.slice(-6));
    }
  });
  it('HOTP RFC 4226 vectors', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((c, i) => expect(hotp(SECRET, BigInt(i))).toBe(c));
  });
  it('verifies within one step of skew and rejects otherwise', () => {
    const t = 1111111111;
    expect(verifyTotp(SECRET, totpAt(SECRET, t), t)).toBe(true);
    expect(verifyTotp(SECRET, totpAt(SECRET, t - 30), t)).toBe(true);
    expect(verifyTotp(SECRET, totpAt(SECRET, t + 30), t)).toBe(true);
    expect(verifyTotp(SECRET, totpAt(SECRET, t + 90), t)).toBe(false);
    expect(verifyTotp(SECRET, '000000', t)).toBe(totpAt(SECRET, t) === '000000');
    expect(verifyTotp(SECRET, 'abcdef', t)).toBe(false);
  });
  it('base32 round-trips and the otpauth URI is well-formed', () => {
    for (const len of [1, 5, 10, 20, 32]) {
      const b = Buffer.alloc(len, len);
      expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    }
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    const uri = otpauthUri('Gurbani Kosh', 'dharam', SECRET);
    expect(uri.startsWith('otpauth://totp/Gurbani%20Kosh:dharam?')).toBe(true);
    expect(new URL(uri).searchParams.get('secret')).toBe(base32Encode(SECRET));
  });
});
