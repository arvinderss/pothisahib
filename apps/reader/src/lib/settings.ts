/** Reader settings: device-local only, never sent anywhere. */
export const THEMES = ['system', 'light', 'sepia', 'dark', 'high-contrast'] as const;
export type Theme = (typeof THEMES)[number];

export interface Settings {
  theme: Theme;
  /** rem multiplier for Gurmukhi text */
  fontScale: number;
  lineHeight: number;
  wordSpacing: number;
  /** ch units */
  maxWidth: number;
  mode: 'padched' | 'larivaar';
  showProvenance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1.6,
  lineHeight: 2.0,
  wordSpacing: 0.25,
  maxWidth: 46,
  mode: 'padched',
  showProvenance: true,
};

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

/** Sanitise anything read back from storage; never trust persisted shape blindly. */
export function normalizeSettings(v: unknown): Settings {
  // normalize-guard: allow  (this normalises a settings object, never text)
  const s = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    theme: (THEMES as readonly string[]).includes(s['theme'] as string)
      ? (s['theme'] as Theme)
      : DEFAULT_SETTINGS.theme,
    fontScale: clamp(s['fontScale'], 0.8, 4, DEFAULT_SETTINGS.fontScale),
    lineHeight: clamp(s['lineHeight'], 1.2, 3.5, DEFAULT_SETTINGS.lineHeight),
    wordSpacing: clamp(s['wordSpacing'], 0, 1.5, DEFAULT_SETTINGS.wordSpacing),
    maxWidth: clamp(s['maxWidth'], 24, 120, DEFAULT_SETTINGS.maxWidth),
    mode: s['mode'] === 'larivaar' ? 'larivaar' : 'padched',
    showProvenance: s['showProvenance'] !== false,
  };
}
