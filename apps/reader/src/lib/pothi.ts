/**
 * Personal Pothis (SRS §20): a named, ordered selection of Banis that is read as one continuous
 * text. A Pothi is device-local, like every other personal record in this app: it is stored in
 * IndexedDB, never transmitted, and holds no Gurbani itself, only slugs referring to verified
 * bundles already on the device.
 */
export interface Pothi {
  id: string;
  name: string;
  /** Bani slugs in reading order; duplicates are not allowed. */
  slugs: string[];
  createdAt: string;
  updatedAt: string;
}

export const POTHI_NAME_MAX = 60;

export function newPothiId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePothiName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') throw new Error('a Pothi needs a name');
  return trimmed.slice(0, POTHI_NAME_MAX);
}

/** Append a Bani, ignoring a slug the Pothi already contains. */
export function addSlug(pothi: Pothi, slug: string): Pothi {
  if (pothi.slugs.includes(slug)) return pothi;
  return { ...pothi, slugs: [...pothi.slugs, slug], updatedAt: new Date().toISOString() };
}

export function removeSlug(pothi: Pothi, slug: string): Pothi {
  if (!pothi.slugs.includes(slug)) return pothi;
  return {
    ...pothi,
    slugs: pothi.slugs.filter((s) => s !== slug),
    updatedAt: new Date().toISOString(),
  };
}

/** Move a Bani up (-1) or down (+1) in the reading order. Out-of-range moves are no-ops. */
export function moveSlug(pothi: Pothi, slug: string, delta: number): Pothi {
  const from = pothi.slugs.indexOf(slug);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pothi.slugs.length) return pothi;
  const slugs = [...pothi.slugs];
  const [moved] = slugs.splice(from, 1);
  slugs.splice(to, 0, moved as string);
  return { ...pothi, slugs, updatedAt: new Date().toISOString() };
}

export function createPothi(name: string, slugs: string[] = []): Pothi {
  const now = new Date().toISOString();
  return {
    id: newPothiId(),
    name: normalizePothiName(name),
    slugs: [...new Set(slugs)],
    createdAt: now,
    updatedAt: now,
  };
}
