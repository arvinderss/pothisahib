/**
 * Auto-scroll engine (SRS §18): continuous scrolling at a user-chosen speed, pause/resume,
 * stop at the end, screen wake-lock while running (where the browser supports it). Pure helpers
 * are exported for tests; the engine itself touches the DOM only through the injected `scroller`.
 */
export const SPEED_MIN = 5; // pixels per second
export const SPEED_MAX = 400;
export const SPEED_STEP = 5;

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return SPEED_MIN;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v)));
}

export function adjustSpeed(current: number, steps: number): number {
  return clampSpeed(current + steps * SPEED_STEP);
}

/** Pixels to scroll for an elapsed interval; carries sub-pixel remainders so slow speeds still move. */
export function stepPixels(speedPxPerSec: number, dtMs: number): number {
  if (dtMs <= 0 || !Number.isFinite(dtMs)) return 0;
  return (speedPxPerSec * Math.min(dtMs, 250)) / 1000; // cap dt: a hidden tab must not jump
}

/**
 * Scrolling is done against an ABSOLUTE floating-point target, not by relative 1 px steps: browsers
 * snap scroll offsets to device pixels, so repeated `scrollBy(1)` at a 1.5× pixel ratio moves 1.33
 * CSS px each time and runs a third too fast. An absolute target cannot accumulate that error.
 */
export interface Scroller {
  position(): number;
  scrollTo(px: number): void;
  atEnd(): boolean;
}

export interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>;
}

export interface AutoScrollerOptions {
  scroller: Scroller;
  getSpeed: () => number;
  /** called when running state changes (started, paused, reached end) */
  onState: (running: boolean, reason: 'user' | 'end' | 'hidden') => void;
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
  wakeLock?: WakeLockLike | null;
}

export interface AutoScroller {
  start(): void;
  stop(reason?: 'user' | 'end' | 'hidden'): void;
  toggle(): void;
  running(): boolean;
  destroy(): void;
}

export function createAutoScroller(o: AutoScrollerOptions): AutoScroller {
  const raf = o.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = o.caf ?? ((id) => cancelAnimationFrame(id));
  let frame: number | null = null;
  let last: number | null = null; // frame timestamps may legitimately be 0
  let target = 0; // absolute scroll target in CSS pixels (fractional)
  let running = false;
  let lock: { release(): Promise<void> } | null = null;

  const acquireLock = async (): Promise<void> => {
    if (!o.wakeLock || lock) return;
    try {
      lock = await o.wakeLock.request('screen');
    } catch {
      lock = null; // unsupported or denied: scrolling still works
    }
  };
  const releaseLock = async (): Promise<void> => {
    const l = lock;
    lock = null;
    if (l) await l.release().catch(() => undefined);
  };

  const tick = (t: number): void => {
    if (!running) return;
    const dt = last === null ? 0 : t - last;
    last = t;
    // if the reader scrolled by hand since the last frame, continue from where they are
    if (Math.abs(o.scroller.position() - target) > 8) target = o.scroller.position();
    target += stepPixels(o.getSpeed(), dt);
    o.scroller.scrollTo(target);
    if (o.scroller.atEnd()) {
      stop('end');
      return;
    }
    frame = raf(tick);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    last = null;
    target = o.scroller.position();
    void acquireLock();
    o.onState(true, 'user');
    frame = raf(tick);
  };
  const stop = (reason: 'user' | 'end' | 'hidden' = 'user'): void => {
    if (!running) return;
    running = false;
    if (frame !== null) caf(frame);
    frame = null;
    void releaseLock();
    o.onState(false, reason);
  };

  return {
    start,
    stop,
    toggle: () => (running ? stop('user') : start()),
    running: () => running,
    destroy: () => {
      stop('user');
    },
  };
}

/** DOM scroller for the page. */
export function pageScroller(): Scroller {
  const el = (): Element => document.scrollingElement ?? document.documentElement;
  return {
    position: () => window.scrollY,
    scrollTo: (px) => window.scrollTo({ top: px, behavior: 'instant' }),
    atEnd: () => {
      const e = el();
      return Math.ceil(e.scrollTop + window.innerHeight) >= e.scrollHeight - 1;
    },
  };
}
