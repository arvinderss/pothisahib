import type { JSX } from 'react';
import type { CatalogBani } from '../lib/api.ts';
import type { State } from '../lib/store.ts';
import { download, refreshCatalog, remove } from '../lib/store.ts';

const STATE_LABEL: Record<string, string> = {
  SOURCE_ONLY: 'No verified text yet',
  PROVISIONAL: 'Provisional (adopted from a source, review pending)',
  REVIEWED: 'Reviewed',
  LOCKED: 'Reviewed and locked',
};

export function Library({
  state,
  onOpen,
}: {
  state: State;
  onOpen: (slug: string) => void;
}): JSX.Element {
  const groups = new Map<string, CatalogBani[]>();
  for (const b of state.catalog) {
    const key = b.granth.name;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const downloadedSlugs = Object.keys(state.downloaded);
  return (
    <main className="library" aria-labelledby="library-heading">
      <header className="library-header">
        <h1 id="library-heading">Pothi Sahib</h1>
        <p className="muted">
          {state.online ? 'Online' : 'Offline'} · {downloadedSlugs.length} Bani
          {downloadedSlugs.length === 1 ? '' : 'an'} downloaded
          {state.catalogFetchedAt
            ? ` · library updated ${new Date(state.catalogFetchedAt).toLocaleString()}`
            : ''}
        </p>
        <button type="button" onClick={() => void refreshCatalog()} disabled={!state.online}>
          Refresh library
        </button>
      </header>
      {state.catalog.length === 0 && (
        <p className="notice">
          {state.online
            ? 'The library is loading, or no Bani has been published yet.'
            : 'You are offline and no library has been saved on this device yet.'}
        </p>
      )}
      {[...groups.entries()].map(([granth, items]) => (
        <section key={granth} aria-label={granth}>
          <h2>{granth}</h2>
          <ul className="bani-list">
            {items.map((b) => {
              const dl = state.downloaded[b.slug];
              const busy = state.busy[b.slug];
              const stale =
                dl && b.publishedVersionNo !== null && dl.versionNo !== b.publishedVersionNo;
              return (
                <li key={b.slug} className="bani-row">
                  <div className="bani-main">
                    <span className="bani-name">{b.name}</span>
                    <span className={`badge badge-${b.verificationState.toLowerCase()}`}>
                      {STATE_LABEL[b.verificationState] ?? b.verificationState}
                    </span>
                    {dl && (
                      <span className="muted small">
                        Downloaded v{dl.versionNo}
                        {stale ? ` · v${b.publishedVersionNo} available` : ''}
                      </span>
                    )}
                  </div>
                  <div className="bani-actions">
                    {dl && (
                      <button type="button" onClick={() => onOpen(b.slug)}>
                        Read
                      </button>
                    )}
                    {b.textAvailable && (!dl || stale) && (
                      <button
                        type="button"
                        onClick={() => void download(b.slug)}
                        disabled={!state.online || Boolean(busy)}
                      >
                        {busy ?? (dl ? 'Update' : 'Download')}
                      </button>
                    )}
                    {dl && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => void remove(b.slug)}
                        aria-label={`Remove ${b.name} from this device`}
                      >
                        Remove
                      </button>
                    )}
                    {!b.textAvailable && <span className="muted small">Not yet available</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
