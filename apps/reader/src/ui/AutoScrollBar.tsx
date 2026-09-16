import type { JSX } from 'react';
import { SPEED_MAX, SPEED_MIN, SPEED_STEP } from '../lib/autoscroll.ts';

export function AutoScrollBar({
  running,
  speed,
  onToggle,
  onSpeed,
  onFullscreen,
  fullscreen,
  wakeLockSupported,
}: {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeed: (v: number) => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  wakeLockSupported: boolean;
}): JSX.Element {
  return (
    <div className="autoscroll" role="toolbar" aria-label="Auto-scroll">
      <button
        type="button"
        className="primary"
        onClick={onToggle}
        aria-pressed={running}
        aria-label={running ? 'Pause auto-scroll' : 'Start auto-scroll'}
      >
        {running ? '❚❚ Pause' : '▶ Auto-scroll'}
      </button>
      <button
        type="button"
        onClick={() => onSpeed(speed - SPEED_STEP)}
        aria-label="Slower"
        disabled={speed <= SPEED_MIN}
      >
        −
      </button>
      <label className="speed">
        <span className="visually-hidden">Speed</span>
        <input
          type="range"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          aria-valuetext={`${speed} pixels per second`}
        />
      </label>
      <button
        type="button"
        onClick={() => onSpeed(speed + SPEED_STEP)}
        aria-label="Faster"
        disabled={speed >= SPEED_MAX}
      >
        +
      </button>
      <output className="small muted" aria-live="polite">
        {speed} px/s{running && wakeLockSupported ? ' · screen kept awake' : ''}
      </output>
      <button
        type="button"
        className="quiet"
        onClick={onFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
      >
        {fullscreen ? '⤡' : '⤢'}
      </button>
    </div>
  );
}
