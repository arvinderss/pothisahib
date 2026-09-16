/**
 * The offline bundle contract shared by the public API (producer) and the reader (consumer).
 * A bundle is one Bani's published accepted text with word offsets and per-line SHA-256 hashes,
 * plus a bundle hash over the line hashes, so the reader can verify integrity before storing or
 * rendering anything (RISK_REGISTER R-23). Nothing in a bundle is normalised.
 */
export const BUNDLE_FORMAT = 'kosh-bundle/1';

export interface BundleLine {
  lineId: string;
  sectionId: string;
  ordinal: number;
  /** exact accepted text */
  text: string;
  /** hex SHA-256 of the UTF-8 bytes of `text` */
  sha256: string;
  codepointCount: number;
  /** [cpStart, cpEnd) codepoint offsets of each word into `text` */
  tokens: [number, number][];
}

export interface BundleSection {
  id: string;
  parentId: string | null;
  type: string;
  ordinal: number;
  label: string | null;
}

export interface BundleSource {
  slug: string;
  name: string;
  license: string | null;
  redistribution: string;
  attributionText: string | null;
  lastSyncedAt: string | null;
}

export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  bani: {
    id: string;
    slug: string;
    name: string;
    verificationState: string;
    granth: { slug: string; name: string };
  };
  versionNo: number;
  basis: string;
  publishedAt: string | null;
  /** lineage-root source of the accepted text (for the provisional tag and attribution) */
  source: BundleSource | null;
  sections: BundleSection[];
  lines: BundleLine[];
  /** hex SHA-256 of bundleHashInput(lines) */
  bundleSha256: string;
  generatedAt: string;
}

/** The exact byte string whose SHA-256 is `bundleSha256`: line hashes in order, LF-joined. */
export function bundleHashInput(lineShas: readonly string[]): string {
  return lineShas.join('\n');
}

/** Structural (non-cryptographic) validation of a bundle received from the network. */
export function isBundleShape(v: unknown): v is Bundle {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  if (b['format'] !== BUNDLE_FORMAT) return false;
  if (typeof b['bundleSha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(b['bundleSha256']))
    return false;
  if (!Array.isArray(b['lines']) || !Array.isArray(b['sections'])) return false;
  const bani = b['bani'] as Record<string, unknown> | undefined;
  if (!bani || typeof bani['slug'] !== 'string' || typeof bani['name'] !== 'string') return false;
  for (const l of b['lines'] as unknown[]) {
    const x = l as Record<string, unknown>;
    if (
      typeof x['text'] !== 'string' ||
      typeof x['sha256'] !== 'string' ||
      !Array.isArray(x['tokens'])
    )
      return false;
    for (const t of x['tokens'] as unknown[]) {
      if (
        !Array.isArray(t) ||
        t.length !== 2 ||
        typeof t[0] !== 'number' ||
        typeof t[1] !== 'number'
      )
        return false;
    }
  }
  return true;
}
