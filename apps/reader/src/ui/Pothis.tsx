import { useState, type JSX } from 'react';
import type { State } from '../lib/store.ts';
import {
  addPothi,
  addToPothi,
  deletePothi,
  removeFromPothi,
  renamePothi,
  reorderPothi,
} from '../lib/store.ts';
import { POTHI_NAME_MAX, type Pothi } from '../lib/pothi.ts';

/**
 * Personal Pothis (SRS §20). A Pothi is an ordered selection of Banis already downloaded on this
 * device, read as one continuous text. Everything here stays on the device.
 */
export function Pothis({
  state,
  onRead,
}: {
  state: State;
  onRead: (id: string) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const nameFor = (slug: string): string =>
    state.catalog.find((b) => b.slug === slug)?.name ?? slug;
  const downloaded = Object.keys(state.downloaded);

  const create = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    void addPothi(trimmed);
    setName('');
  };

  return (
    <section className="pothis" aria-labelledby="pothis-heading">
      <h2 id="pothis-heading">Your Pothis</h2>
      <p className="muted small">
        A Pothi is your own ordered selection of Banian, read end to end. Pothis are kept on this
        device only.
      </p>
      <div className="pothi-new">
        <label htmlFor="pothi-name">New Pothi</label>
        <input
          id="pothi-name"
          value={name}
          maxLength={POTHI_NAME_MAX}
          placeholder="Morning Nitnem"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
          }}
        />
        <button type="button" onClick={create} disabled={name.trim() === ''}>
          Create
        </button>
      </div>

      {state.pothis.length === 0 && (
        <p className="notice">No Pothi yet. Create one, then add Banian you have downloaded.</p>
      )}

      <ul className="pothi-list">
        {state.pothis.map((p: Pothi) => {
          const open = editing === p.id;
          const missing = p.slugs.filter((s) => !state.downloaded[s]);
          return (
            <li key={p.id} className="pothi">
              <div className="pothi-head">
                <span className="pothi-name">{p.name}</span>
                <span className="muted small">
                  {p.slugs.length} Bani{p.slugs.length === 1 ? '' : 'an'}
                  {missing.length > 0 ? ` · ${missing.length} not downloaded` : ''}
                </span>
                <div className="grow" />
                <button type="button" onClick={() => onRead(p.id)} disabled={p.slugs.length === 0}>
                  Read
                </button>
                <button type="button" onClick={() => setEditing(open ? null : p.id)}>
                  {open ? 'Done' : 'Edit'}
                </button>
              </div>

              {open && (
                <div className="pothi-edit">
                  <label htmlFor={`rename-${p.id}`}>Name</label>
                  <input
                    id={`rename-${p.id}`}
                    defaultValue={p.name}
                    maxLength={POTHI_NAME_MAX}
                    onBlur={(e) => void renamePothi(p.id, e.target.value || p.name)}
                  />

                  <ol className="pothi-items">
                    {p.slugs.map((slug, i) => (
                      <li key={slug}>
                        <span className={state.downloaded[slug] ? '' : 'muted'}>
                          {nameFor(slug)}
                          {state.downloaded[slug] ? '' : ' (not downloaded)'}
                        </span>
                        <div className="grow" />
                        <button
                          type="button"
                          className="quiet"
                          aria-label={`Move ${nameFor(slug)} up`}
                          disabled={i === 0}
                          onClick={() => void reorderPothi(p.id, slug, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={`Move ${nameFor(slug)} down`}
                          disabled={i === p.slugs.length - 1}
                          onClick={() => void reorderPothi(p.id, slug, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={`Remove ${nameFor(slug)} from ${p.name}`}
                          onClick={() => void removeFromPothi(p.id, slug)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>

                  <label htmlFor={`add-${p.id}`}>Add a downloaded Bani</label>
                  <select
                    id={`add-${p.id}`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) void addToPothi(p.id, e.target.value);
                    }}
                  >
                    <option value="">Choose…</option>
                    {downloaded
                      .filter((s) => !p.slugs.includes(s))
                      .map((s) => (
                        <option key={s} value={s}>
                          {nameFor(s)}
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    className="quiet danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete the Pothi "${p.name}"? The Banian stay on this device.`,
                        )
                      )
                        void deletePothi(p.id);
                    }}
                  >
                    Delete this Pothi
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
