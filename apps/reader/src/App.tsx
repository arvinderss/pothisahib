import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { clearError, init, store } from './lib/store.ts';
import { Library } from './ui/Library.tsx';
import { Reader } from './ui/Reader.tsx';
import { SettingsPanel } from './ui/SettingsPanel.tsx';

type Route = { view: 'library' } | { view: 'read'; slug: string };

function parseRoute(hash: string): Route {
  const m = /^#\/read\/([a-z0-9][a-z0-9-]{1,79})$/.exec(hash);
  return m ? { view: 'read', slug: m[1] as string } : { view: 'library' };
}

export function App(): JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void init();
    const onHash = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset['theme'] = state.settings.theme;
  }, [state.settings.theme]);

  const go = (r: Route): void => {
    window.location.hash = r.view === 'read' ? `#/read/${r.slug}` : '#/';
  };

  return (
    <div className="app">
      <nav className="topbar" aria-label="Application">
        <button type="button" className="quiet" onClick={() => go({ view: 'library' })}>
          Pothi Sahib
        </button>
        <div className="grow" />
        {!state.online && <span className="badge badge-offline">Offline</span>}
        <button type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
          Settings
        </button>
      </nav>
      {state.error && (
        <div className="notice error" role="alert">
          {state.error}{' '}
          <button type="button" className="quiet" onClick={clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {route.view === 'library' ? (
        <Library state={state} onOpen={(slug) => go({ view: 'read', slug })} />
      ) : (
        <Reader
          slug={route.slug}
          settings={state.settings}
          onBack={() => go({ view: 'library' })}
        />
      )}
      <SettingsPanel
        settings={state.settings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
