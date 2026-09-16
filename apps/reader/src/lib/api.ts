/**
 * Thin client for the public read-only API. Only GET requests; no credentials; no telemetry.
 */
import type { Bundle } from '@pothisahib/domain';

export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '/api/v1').replace(/\/$/, '');

export interface CatalogBani {
  id: string;
  slug: string;
  name: string;
  granth: { slug: string; name: string };
  verificationState: string;
  publishedVersionNo: number | null;
  publishedAt: string | null;
  textAvailable: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method: 'GET',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new ApiError(`request failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

export async function fetchCatalog(): Promise<CatalogBani[]> {
  const r = await getJson<{ items: CatalogBani[] }>('/banis');
  return r.items;
}

export interface BundleFetch {
  bundle: Bundle | null;
  etag: string | null;
  notModified: boolean;
}

/** Fetch a bundle; with a known ETag the server may answer 304 and we keep the stored copy. */
export async function fetchBundle(slug: string, knownEtag: string | null): Promise<BundleFetch> {
  const headers: Record<string, string> = {};
  if (knownEtag) headers['If-None-Match'] = knownEtag;
  const res = await fetch(`${API_BASE}/banis/${encodeURIComponent(slug)}/bundle`, {
    method: 'GET',
    headers,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (res.status === 304) return { bundle: null, etag: knownEtag, notModified: true };
  if (!res.ok) throw new ApiError(`bundle unavailable (${res.status})`, res.status);
  return {
    bundle: (await res.json()) as Bundle,
    etag: res.headers.get('ETag'),
    notModified: false,
  };
}
