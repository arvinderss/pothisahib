/** Errors carry an HTTP-ish status so the API can map them without leaking internals. */
export class KoshError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'KoshError';
  }
}
export class NotFoundError extends KoshError {
  constructor(what: string) {
    super(`${what} not found`, 404, 'NOT_FOUND');
  }
}
export class ConflictError extends KoshError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}
export class ForbiddenError extends KoshError {
  constructor(message = 'forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}
export class UnauthorizedError extends KoshError {
  constructor(message = 'authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}
export class BadRequestError extends KoshError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
  }
}
export class IntegrityError extends KoshError {
  /** Raised when the database refused an operation through a constraint or trigger. */
  constructor(message: string) {
    super(message, 409, 'INTEGRITY');
  }
}

/** Translate a database refusal into a KoshError with a safe message. */
export function fromDb(e: unknown): never {
  const err = e as { code?: string; message?: string };
  const msg = (err.message ?? 'database error').split('\n')[0] ?? 'database error';
  switch (err.code) {
    case '23505':
      throw new ConflictError('already exists');
    case '23503':
      throw new BadRequestError('referenced object does not exist');
    case '23514':
    case '23000':
    case 'P0001':
      throw new IntegrityError(msg);
    case '42501':
      throw new ForbiddenError(msg);
    default:
      throw e;
  }
}
