import type { JSX } from 'react';
import { THEMES, type Settings } from '../lib/settings.ts';
import { saveSettings } from '../lib/store.ts';

export function SettingsPanel({
  settings,
  open,
  onClose,
}: {
  settings: Settings;
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  if (!open) return null;
  const set = (patch: Partial<Settings>): void => void saveSettings(patch);
  return (
    <aside className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
      <div className="settings-head">
        <h2 id="settings-heading">Settings</h2>
        <button type="button" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>
      <p className="muted small">Saved on this device only. Nothing is sent anywhere.</p>

      <fieldset>
        <legend>Reading mode</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={settings.mode === 'padched'}
            onChange={() => set({ mode: 'padched' })}
          />{' '}
          Pad Ched
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={settings.mode === 'larivaar'}
            onChange={() => set({ mode: 'larivaar' })}
          />{' '}
          Larivaar
        </label>
      </fieldset>

      <label>
        Theme
        <select
          value={settings.theme}
          onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}
        >
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        Text size <output>{settings.fontScale.toFixed(1)}×</output>
        <input
          type="range"
          min={0.8}
          max={4}
          step={0.1}
          value={settings.fontScale}
          onChange={(e) => set({ fontScale: Number(e.target.value) })}
        />
      </label>
      <label>
        Line spacing <output>{settings.lineHeight.toFixed(1)}</output>
        <input
          type="range"
          min={1.2}
          max={3.5}
          step={0.1}
          value={settings.lineHeight}
          onChange={(e) => set({ lineHeight: Number(e.target.value) })}
        />
      </label>
      <label>
        Word spacing <output>{settings.wordSpacing.toFixed(2)}em</output>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={settings.wordSpacing}
          onChange={(e) => set({ wordSpacing: Number(e.target.value) })}
          disabled={settings.mode === 'larivaar'}
        />
      </label>
      <label>
        Content width <output>{settings.maxWidth}ch</output>
        <input
          type="range"
          min={24}
          max={120}
          step={2}
          value={settings.maxWidth}
          onChange={(e) => set({ maxWidth: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.showProvenance}
          onChange={(e) => set({ showProvenance: e.target.checked })}
        />{' '}
        Show provenance / verification status
      </label>
      <label>
        Auto-scroll speed <output>{settings.autoScrollSpeed} px/s</output>
        <input
          type="range"
          min={5}
          max={400}
          step={5}
          value={settings.autoScrollSpeed}
          onChange={(e) => set({ autoScrollSpeed: Number(e.target.value) })}
        />
      </label>
      <p className="muted small">
        In the reader: Space starts or pauses auto-scroll, + and − change speed, F toggles full
        screen, Esc stops. Tapping the text pauses or resumes.
      </p>
    </aside>
  );
}
