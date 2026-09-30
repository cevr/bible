// Time is the only input to a frame. These helpers turn "seconds since the
// scene began" into eased 0→1 progress values and keyframed numbers.

import type { EaseName } from './schema.ts';

export type Ease = (t: number) => number;

/**
 * Frames a second a film draws at when its spec names no rate (`createFilm`).
 * The tools, which never load the film's page, resolve a short on it before
 * a render; the render resolves it again on the page's own rate.
 */
export const FILM_FPS = 30;

/** A stretch of time, `from` to `to`, in seconds on whatever clock it is read against. */
export interface Interval {
  readonly from: number;
  readonly to: number;
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  inOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  outBack: (t) => {
    // Pinned ends: the polynomial lands at ~1e-16 for t = 0, which would read as "started".
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  /** Settles with one soft overshoot — a paper cut-out landing. */
  outSoft: (t) => 1 - (1 - t) ** 3 * Math.cos(t * Math.PI * 1.1),
} satisfies Record<string, Ease>;

/** The ease a cue, a `progress`, an `envelope` or a keyframe declares none of. */
export const DEFAULT_EASE = 'inOutCubic' satisfies keyof typeof ease;

/** 0→1 over [start, start + dur], eased. Before start: 0. After: 1. */
export const progress = (t: number, start: number, dur: number, e: Ease = ease[DEFAULT_EASE]) =>
  dur <= 0 ? (t >= start ? 1 : 0) : e(clamp((t - start) / dur));

/** Rises 0→1 over `inDur`, holds, falls 1→0 over `outDur` ending at `end`. */
export const envelope = (
  t: number,
  start: number,
  end: number,
  inDur = 0.5,
  outDur = 0.5,
  e: Ease = ease[DEFAULT_EASE],
) => Math.min(progress(t, start, inDur, e), 1 - progress(t, end - outDur, outDur, e));

/**
 * A walker's bob, in units (+ up), while the `walk` span runs and 0 outside
 * it: a step every π/7 s counted from the span's start, each rising up to 5
 * units, so the bob starts from rest and never jumps as the walk begins.
 */
export const gait = (t: number, walk: { readonly start: number; readonly end: number }): number =>
  t > walk.start && t < walk.end ? Math.abs(Math.sin((t - walk.start) * 7)) * 5 : 0;

/** A keyframe: its time, its value, and the ease (by name, as data) of the segment arriving at it. */
export type Key = readonly [time: number, value: number, ease?: EaseName];

/**
 * Piecewise keyframes. Each key's ease shapes the segment arriving at it; a
 * key that names none takes `fallback`.
 */
export const keys = (
  t: number,
  frames: ReadonlyArray<Key>,
  fallback: EaseName = DEFAULT_EASE,
): number => {
  const first = frames[0];
  if (first === undefined) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (prev === undefined || next === undefined) break;
    if (t <= next[0]) {
      const e = ease[next[2] ?? fallback];
      return lerp(prev[1], next[1], e(invLerp(prev[0], next[0], t)));
    }
  }
  return frames[frames.length - 1]?.[1] ?? 0;
};
