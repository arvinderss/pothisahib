/** Small, dependency-free validators used at every trust boundary. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
export const TOTP_RE = /^[0-9]{6}$/;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

export function isSlug(v: unknown): v is string {
  return typeof v === 'string' && SLUG_RE.test(v);
}
export function isUsername(v: unknown): v is string {
  return typeof v === 'string' && USERNAME_RE.test(v);
}
export function isPassword(v: unknown): v is string {
  return typeof v === 'string' && v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX;
}
export function isId(v: unknown): v is string | number {
  return (
    (typeof v === 'string' && /^[0-9]{1,18}$/.test(v)) ||
    (typeof v === 'number' && Number.isSafeInteger(v) && v > 0)
  );
}
export function asId(v: unknown): string {
  if (!isId(v)) throw new ValidationError('invalid id');
  return String(v);
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
