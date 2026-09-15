import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function sha256(data: Uint8Array | string): Buffer {
  return createHash('sha256').update(data).digest();
}
export function sha256Hex(data: Uint8Array | string): string {
  return sha256(data).toString('hex');
}
export function hmacSha256(key: Uint8Array, data: Uint8Array | string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** AES-256-GCM: output = iv(12) || tag(16) || ciphertext. Key is any secret; it is hashed to 32 bytes. */
export function encryptSecret(plaintext: Uint8Array, key: string): Buffer {
  const k = sha256(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}
export function decryptSecret(blob: Uint8Array, key: string): Buffer {
  const b = Buffer.from(blob);
  if (b.length < 28) throw new Error('ciphertext too short');
  const k = sha256(key);
  const decipher = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]);
}

/** Cryptographically random 6-digit anonymous label component (SRS §26). */
export function randomSixDigits(): string {
  // rejection sampling to avoid modulo bias
  for (;;) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < 4_000_000_000) return String(n % 1_000_000).padStart(6, '0');
  }
}
