/**
 * Object storage for raw source artefacts (and later evidence). Content-addressed: the key is
 * derived from the SHA-256 of the bytes, so a stored object can never be silently replaced and
 * every read is verifiable. The filesystem implementation is for development, tests and small
 * self-hosted deployments; an S3-compatible implementation can be added behind the same
 * interface without touching callers.
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { sha256Hex } from './crypto.ts';

export interface ObjectStore {
  /** Store bytes; returns the content-addressed key. Idempotent. */
  put(bytes: Uint8Array, prefix?: string): Promise<string>;
  /** Read bytes for a key; verifies the hash embedded in the key. */
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[a-z0-9-]+\/[0-9a-f]{64}$/;

export function keyFor(bytes: Uint8Array, prefix = 'snapshots'): string {
  if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error('invalid storage prefix');
  return `${prefix}/${sha256Hex(bytes)}`;
}

export class FsObjectStore implements ObjectStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private pathFor(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('invalid storage key'); // also prevents path traversal
    const [prefix, hex] = key.split('/') as [string, string];
    return join(this.root, prefix, hex.slice(0, 2), hex);
  }
  async put(bytes: Uint8Array, prefix = 'snapshots'): Promise<string> {
    const key = keyFor(bytes, prefix);
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    try {
      await access(p);
      return key; // already present: content-addressed, so identical by construction
    } catch {
      await writeFile(p, bytes, { flag: 'wx' });
      return key;
    }
  }
  async get(key: string): Promise<Uint8Array> {
    const p = this.pathFor(key);
    const bytes = await readFile(p);
    const expected = key.split('/')[1];
    if (sha256Hex(bytes) !== expected) throw new Error(`object ${key} failed integrity check`);
    return bytes;
  }
  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory store for tests. */
export class MemoryObjectStore implements ObjectStore {
  private readonly m = new Map<string, Uint8Array>();
  async put(bytes: Uint8Array, prefix = 'snapshots'): Promise<string> {
    const key = keyFor(bytes, prefix);
    if (!this.m.has(key)) this.m.set(key, Uint8Array.from(bytes));
    return key;
  }
  async get(key: string): Promise<Uint8Array> {
    const v = this.m.get(key);
    if (!v) throw new Error(`object ${key} not found`);
    return Uint8Array.from(v);
  }
  async exists(key: string): Promise<boolean> {
    return this.m.has(key);
  }
}
