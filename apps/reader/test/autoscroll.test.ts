import { describe, expect, it } from 'vitest';
import {
  adjustSpeed,
  clampSpeed,
  createAutoScroller,
  SPEED_MAX,
  SPEED_MIN,
  stepPixels,
  type Scroller,
} from '../src/lib/autoscroll.ts';

describe('auto-scroll helpers', () => {
  it('clamps and steps speed within the allowed range', () => {
    expect(clampSpeed(0)).toBe(SPEED_MIN);
    expect(clampSpeed(9999)).toBe(SPEED_MAX);
    expect(clampSpeed(Number.NaN)).toBe(SPEED_MIN);
    expect(adjustSpeed(40, 1)).toBe(45);
    expect(adjustSpeed(SPEED_MAX, 1)).toBe(SPEED_MAX);
    expect(adjustSpeed(SPEED_MIN, -1)).toBe(SPEED_MIN);
  });
  it('converts speed and elapsed time to pixels, capping long gaps', () => {
    expect(stepPixels(100, 1000)).toBe(25); // dt capped at 250 ms so a hidden tab never jumps
    expect(stepPixels(100, 100)).toBe(10);
    expect(stepPixels(40, 16)).toBeCloseTo(0.64);
    expect(stepPixels(40, 0)).toBe(0);
    expect(stepPixels(40, -5)).toBe(0);
  });
});

/** Fake frame scheduler: frames are pumped manually with explicit timestamps. */
function fakeFrames(): {
  raf: (cb: (t: number) => void) => number;
  caf: (id: number) => void;
  pump: (t: number) => void;
  pending: () => number;
} {
  let next = 1;
  const cbs = new Map<number, (t: number) => void>();
  return {
    raf: (cb) => {
      const id = next++;
      cbs.set(id, cb);
      return id;
    },
    caf: (id) => void cbs.delete(id),
    pump: (t) => {
      const current = [...cbs.entries()];
      cbs.clear();
      for (const [, cb] of current) cb(t);
    },
    pending: () => cbs.size,
  };
}

/** Snaps to whole "device pixels" at a 1.5 ratio, like a real browser, to prove the engine is immune. */
function fakeScroller(height: number, viewport: number): Scroller & { top: number } {
  const s = {
    top: 0,
    position: () => s.top,
    scrollTo(px: number) {
      s.top = Math.min(height - viewport, Math.round(px * 1.5) / 1.5);
    },
    atEnd: () => s.top >= height - viewport,
  };
  return s;
}

describe('auto-scroller engine', () => {
  it('scrolls by speed × time, carries sub-pixels, pauses and resumes, stops at the end', async () => {
    const f = fakeFrames();
    const sc = fakeScroller(1000, 500);
    const states: [boolean, string][] = [];
    let speed = 100;
    const releases: number[] = [];
    let requests = 0;
    const wakeLock = {
      request: async () => {
        requests++;
        return { release: async () => void releases.push(1) };
      },
    };
    const a = createAutoScroller({
      scroller: sc,
      getSpeed: () => speed,
      onState: (r, why) => states.push([r, why]),
      raf: f.raf,
      caf: f.caf,
      wakeLock,
    });
    a.start();
    await Promise.resolve();
    expect(a.running()).toBe(true);
    expect(requests).toBe(1);
    f.pump(0); // first frame establishes the clock
    f.pump(1000); // dt capped at 250ms → 25px at 100px/s
    expect(sc.top).toBeCloseTo(25, 0);
    speed = 40;
    // 60 frames of 16 ms at 40 px/s must advance ~38.4 px regardless of device-pixel snapping
    for (let t = 1016; t <= 1960; t += 16) f.pump(t);
    expect(sc.top).toBeCloseTo(25 + 38.4, 0);
    a.stop();
    await Promise.resolve();
    expect(a.running()).toBe(false);
    expect(f.pending()).toBe(0);
    expect(releases.length).toBe(1);
    a.toggle();
    expect(a.running()).toBe(true);
    speed = 400;
    f.pump(2000);
    for (let t = 2250; sc.top < 500 && t < 20000; t += 250) f.pump(t);
    expect(sc.top).toBe(500);
    expect(a.running()).toBe(false); // stopped at the end
    expect(states.at(-1)).toEqual([false, 'end']);
    expect(f.pending()).toBe(0);
  });
  it('does not fail when the wake-lock API is missing or refuses', async () => {
    const f = fakeFrames();
    const a = createAutoScroller({
      scroller: fakeScroller(100, 50),
      getSpeed: () => 50,
      onState: () => undefined,
      raf: f.raf,
      caf: f.caf,
      wakeLock: { request: async () => Promise.reject(new Error('denied')) },
    });
    a.start();
    await Promise.resolve();
    expect(a.running()).toBe(true);
    a.destroy();
    expect(a.running()).toBe(false);
  });
});
