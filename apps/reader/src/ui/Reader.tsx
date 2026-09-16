import { useEffect, useRef, useState, type JSX } from 'react';
import type { Bundle } from '@pothisahib/domain';
import { segments } from '../lib/render.ts';
import type { Settings } from '../lib/settings.ts';
import { loadBundle, loadPosition, savePosition } from '../lib/store.ts';

function Provenance({ bundle }: { bundle: Bundle }): JSX.Element | null {
  const s = bundle.source;
  const state = bundle.bani.verificationState;
  if (state === 'PROVISIONAL') {
    return (
      <p className="provenance" role="note">
        Provisional text: adopted from <strong>{s?.name ?? 'a registered source'}</strong>
        {s?.lastSyncedAt ? ` (synced ${new Date(s.lastSyncedAt).toLocaleDateString()})` : ''};
        cross-source review pending. Version {bundle.versionNo}.
        {s?.attributionText ? <span className="attribution"> {s.attributionText}</span> : null}
      </p>
    );
  }
  return (
    <p className="provenance" role="note">
      {state === 'LOCKED' ? 'Reviewed and locked' : 'Reviewed'} · version {bundle.versionNo}
      {s?.attributionText ? <span className="attribution"> · {s.attributionText}</span> : null}
    </p>
  );
}

export function Reader({
  slug,
  settings,
  onBack,
}: {
  slug: string;
  settings: Settings;
  onBack: () => void;
}): JSX.Element {
  const [bundle, setBundle] = useState<Bundle | null | 'missing' | 'corrupt'>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const b = await loadBundle(slug);
      if (cancelled) return;
      if (!b) {
        setBundle(
          (await import('../lib/db.ts')).db.bundles
            .get(slug)
            .then((x) => (x ? 'corrupt' : 'missing')) as never,
        );
        const x = await (await import('../lib/db.ts')).db.bundles.get(slug);
        setBundle(x ? 'corrupt' : 'missing');
        return;
      }
      setBundle(b);
      const pos = await loadPosition(slug);
      if (pos) setCurrent(pos);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!current || restored.current || typeof bundle !== 'object' || bundle === null) return;
    restored.current = true;
    document.getElementById(`line-${current}`)?.scrollIntoView({ block: 'center' });
  }, [current, bundle]);

  // remember the topmost visible line as the reading position (device-local only)
  useEffect(() => {
    if (
      typeof bundle !== 'object' ||
      bundle === null ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) void savePosition(slug, (top.target as HTMLElement).dataset['lineId'] ?? '');
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    document.querySelectorAll('.line').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [bundle, slug, settings.mode]);

  if (bundle === null) return <p className="notice">Opening…</p>;
  if (bundle === 'missing')
    return (
      <p className="notice">
        This Bani is not downloaded on this device.{' '}
        <button type="button" onClick={onBack}>
          Back to library
        </button>
      </p>
    );
  if (bundle === 'corrupt')
    return (
      <p className="notice error" role="alert">
        The stored copy of this Bani failed its integrity check and will not be shown. Remove it and
        download it again.{' '}
        <button type="button" onClick={onBack}>
          Back to library
        </button>
      </p>
    );

  const sectionsById = new Map(bundle.sections.map((s) => [s.id, s]));
  let lastSection: string | null = null;

  return (
    <main className="reader" aria-labelledby="bani-heading">
      <header className="reader-header">
        <button type="button" onClick={onBack} className="quiet">
          ← Library
        </button>
        <h1 id="bani-heading">{bundle.bani.name}</h1>
        {settings.showProvenance && <Provenance bundle={bundle} />}
      </header>
      <article
        className={`text mode-${settings.mode}`}
        lang="pa"
        style={{
          fontSize: `${settings.fontScale}rem`,
          lineHeight: settings.lineHeight,
          wordSpacing: settings.mode === 'padched' ? `${settings.wordSpacing}em` : '0',
          maxWidth: `${settings.maxWidth}ch`,
        }}
      >
        {bundle.lines.map((line) => {
          const sec = sectionsById.get(line.sectionId);
          const heading =
            sec && sec.id !== lastSection && (sec.label || sec.type !== 'BODY') ? sec : null;
          lastSection = line.sectionId;
          const segs = segments(line.text, line.tokens, settings.mode);
          return (
            <div key={line.lineId}>
              {heading && (
                <h2 className="section-heading">
                  {heading.type.toLowerCase()}
                  {heading.label ? ` ${heading.label}` : ''}
                </h2>
              )}
              <p
                className={`line${line.text.trim() === '' ? ' blank' : ''}`}
                id={`line-${line.lineId}`}
                data-line-id={line.lineId}
              >
                {segs.map((s, i) =>
                  s.kind === 'word' ? (
                    <span key={i} className="word" data-ordinal={s.ordinal}>
                      {s.text}
                    </span>
                  ) : (
                    <span key={i} className="gap">
                      {s.text}
                    </span>
                  ),
                )}
              </p>
            </div>
          );
        })}
      </article>
    </main>
  );
}
