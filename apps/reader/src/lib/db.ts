/**
 * Device-local storage (IndexedDB via Dexie). Holds verified bundles, the catalogue cache,
 * settings and reading positions. Nothing here is ever transmitted (docs/privacy.md).
 */
import Dexie, { type Table } from 'dexie';
import type { Bundle } from '@pothisahib/domain';
import type { CatalogBani } from './api.ts';
import type { Settings } from './settings.ts';

export interface StoredBundle {
  slug: string;
  etag: string | null;
  bundle: Bundle;
  verifiedAt: string;
}
export interface StoredCatalog {
  id: 'catalog';
  items: CatalogBani[];
  fetchedAt: string;
}
export interface StoredSettings {
  id: 'settings';
  value: Settings;
}
export interface ReadingPosition {
  slug: string;
  lineId: string;
  updatedAt: string;
}

class ReaderDb extends Dexie {
  bundles!: Table<StoredBundle, string>;
  catalog!: Table<StoredCatalog, string>;
  settings!: Table<StoredSettings, string>;
  positions!: Table<ReadingPosition, string>;
  constructor() {
    super('pothi-sahib');
    this.version(1).stores({ bundles: 'slug', catalog: 'id', settings: 'id', positions: 'slug' });
  }
}

export const db: ReaderDb = new ReaderDb();
