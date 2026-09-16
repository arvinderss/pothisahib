/**
 * Application state: catalogue, downloaded bundles, settings, connectivity. Plain React-external
 * store with a subscribe/getSnapshot pair for useSyncExternalStore.
 */
import type { Bundle } from '@pothisahib/domain';
import { fetchBundle, fetchCatalog, type CatalogBani } from './api.ts';
import { verifyBundle } from './bundle.ts';
import { db, type StoredBundle } from './db.ts';
import {
  addSlug,
  createPothi,
  moveSlug,
  normalizePothiName,
  removeSlug,
  type Pothi,
} from './pothi.ts';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings.ts';

export interface State {
  catalog: CatalogBani[];
  catalogFetchedAt: string | null;
  downloaded: Record<string, { etag: string | null; versionNo: number; verifiedAt: string }>;
  settings: Settings;
  online: boolean;
  pothis: Pothi[];
  busy: Record<string, string>; // slug -> status text
  error: string | null;
}

let state: State = {
  catalog: [],
  catalogFetchedAt: null,
  downloaded: {},
  settings: DEFAULT_SETTINGS,
  pothis: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  busy: {},
  error: null,
};
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());
const set = (patch: Partial<State>): void => {
  state = { ...state, ...patch };
  emit();
};

export const store = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot(): State {
    return state;
  },
};

export async function init(): Promise<void> {
  const [cat, saved, bundles, pothis] = await Promise.all([
    db.catalog.get('catalog'),
    db.settings.get('settings'),
    db.bundles.toArray(),
    db.pothis.toArray(),
  ]);
  const downloaded: State['downloaded'] = {};
  for (const b of bundles)
    downloaded[b.slug] = { etag: b.etag, versionNo: b.bundle.versionNo, verifiedAt: b.verifiedAt };
  set({
    catalog: cat?.items ?? [],
    catalogFetchedAt: cat?.fetchedAt ?? null,
    settings: normalizeSettings(saved?.value),
    downloaded,
    pothis: pothis.sort((a, b) => a.name.localeCompare(b.name)),
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => set({ online: true }));
    window.addEventListener('offline', () => set({ online: false }));
  }
  if (state.online) void refreshCatalog();
}

export async function refreshCatalog(): Promise<void> {
  try {
    const items = await fetchCatalog();
    const fetchedAt = new Date().toISOString();
    await db.catalog.put({ id: 'catalog', items, fetchedAt });
    set({ catalog: items, catalogFetchedAt: fetchedAt, error: null });
  } catch (e) {
    set({
      error: state.catalog.length ? null : `Could not load the library (${(e as Error).message}).`,
    });
  }
}

/** Download (or refresh) one Bani. Stored only after verification succeeds. */
export async function download(slug: string): Promise<void> {
  const known = await db.bundles.get(slug);
  set({ busy: { ...state.busy, [slug]: 'Downloading…' } });
  try {
    const r = await fetchBundle(slug, known?.etag ?? null);
    if (r.notModified) return;
    set({ busy: { ...state.busy, [slug]: 'Verifying…' } });
    const v = await verifyBundle(r.bundle);
    if (!v.ok) throw new Error(`integrity check failed: ${v.reason}`);
    const stored: StoredBundle = {
      slug,
      etag: r.etag,
      bundle: v.bundle,
      verifiedAt: new Date().toISOString(),
    };
    await db.bundles.put(stored);
    set({
      downloaded: {
        ...state.downloaded,
        [slug]: { etag: r.etag, versionNo: v.bundle.versionNo, verifiedAt: stored.verifiedAt },
      },
    });
  } catch (e) {
    set({ error: `${slug}: ${(e as Error).message}` });
  } finally {
    const { [slug]: _done, ...rest } = state.busy;
    void _done;
    set({ busy: rest });
  }
}

export async function remove(slug: string): Promise<void> {
  await db.bundles.delete(slug);
  await db.positions.delete(slug);
  const { [slug]: _gone, ...rest } = state.downloaded;
  void _gone;
  set({ downloaded: rest });
}

export async function loadBundle(slug: string): Promise<Bundle | null> {
  const s = await db.bundles.get(slug);
  if (!s) return null;
  // re-verify on every read: storage is not trusted either
  const v = await verifyBundle(s.bundle);
  return v.ok ? v.bundle : null;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const value = normalizeSettings({ ...state.settings, ...patch });
  await db.settings.put({ id: 'settings', value });
  set({ settings: value });
}

export async function savePosition(slug: string, lineId: string): Promise<void> {
  await db.positions.put({ slug, lineId, updatedAt: new Date().toISOString() });
}
export async function loadPosition(slug: string): Promise<string | null> {
  return (await db.positions.get(slug))?.lineId ?? null;
}

// ---- personal Pothis (device-local, never transmitted)

const persist = async (p: Pothi): Promise<void> => {
  await db.pothis.put(p);
  const others = state.pothis.filter((x) => x.id !== p.id);
  set({ pothis: [...others, p].sort((a, b) => a.name.localeCompare(b.name)) });
};

export async function addPothi(name: string): Promise<Pothi> {
  const p = createPothi(name);
  await persist(p);
  return p;
}

export async function renamePothi(id: string, name: string): Promise<void> {
  const p = state.pothis.find((x) => x.id === id);
  if (!p) return;
  await persist({ ...p, name: normalizePothiName(name), updatedAt: new Date().toISOString() });
}

export async function deletePothi(id: string): Promise<void> {
  await db.pothis.delete(id);
  set({ pothis: state.pothis.filter((p) => p.id !== id) });
}

export async function addToPothi(id: string, slug: string): Promise<void> {
  const p = state.pothis.find((x) => x.id === id);
  if (p) await persist(addSlug(p, slug));
}

export async function removeFromPothi(id: string, slug: string): Promise<void> {
  const p = state.pothis.find((x) => x.id === id);
  if (p) await persist(removeSlug(p, slug));
}

export async function reorderPothi(id: string, slug: string, delta: number): Promise<void> {
  const p = state.pothis.find((x) => x.id === id);
  if (p) await persist(moveSlug(p, slug, delta));
}

export function clearError(): void {
  set({ error: null });
}
