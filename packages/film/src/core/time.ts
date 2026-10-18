// Time is the only input to a frame. These helpers turn "seconds since the
// scene began" into eased 0→1 progress values and keyframed numbers.

import type { EaseName } from './schema.ts';

type Ease = (t: number) => number;

/**
 * Frames a second a film draws at when its spec names no rate (`createFilm`).
 * The tools, which never load the film's page, resolve a short on it before
 * a render; the render resolves it again on the page's own rate.
 */
export const FILM_FPS = 30;

/** A timecode's fields: hours, minutes, seconds and the frame within the second, and its sign. */
interface TimecodeParts {
  readonly negative: boolean;
  readonly hh: string;
  readonly mm: string;
  readonly ss: string;
  readonly ff: string;
}

/**
 * Whether `fps` is a rate a timecode counts in whole seconds of frames: a
 * whole rate (24, 30), or its 1000/1001 rate (30000/1001, NTSC's 29.97),
 * counted as a whole one (non-drop-frame, NDF, as editors count 29.97), so
 * its timecode runs behind the wall clock by a frame in a thousand.
 */
const countedWhole = (fps: number): boolean =>
  [fps, (fps * 1001) / 1000].some((rate) => Math.abs(rate - Math.round(rate)) < GRID_NUDGE);

/**
 * The frame a clock at `seconds` reads at `fps`, the one its timecode says:
 * the nearest (a clock a hair short of a frame, as a video's reads, says
 * that frame).
 */
export const frameRead = (seconds: number, fps: number): number => Math.round(seconds * fps);

/**
 * Seconds as a timecode's fields at `fps`: the frame that time reads
 * (`frameRead`), each field two digits. Its second is the last whose first
 * frame is at or before that frame, and its frame field counts from that
 * first frame, so the field stays under `ceil(fps)` and the timecode never
 * runs back. A whole or 1000/1001 rate counts `round(fps)` frames a second
 * (`countedWhole`); any other (12.5, a phone's 29.6) counts wall seconds, a
 * second's first frame the first to start in it, so its timecode keeps to
 * the clock.
 */
export const timecodeParts = (seconds: number, fps: number = FILM_FPS): TimecodeParts => {
  const frames = frameRead(Math.abs(seconds), fps);
  const perSecond = Math.max(1, Math.round(fps));
  const counted = countedWhole(fps);
  const firstFrameOf = (second: number) =>
    counted ? second * perSecond : frameAtOrAfter(second, fps);
  // Within a second of the answer either way; each candidate is judged by its first frame.
  const near = Math.floor(frames / (counted ? perSecond : fps));
  const whole = [near + 1, near, near - 1].find((second) => firstFrameOf(second) <= frames) ?? 0;
  const within = frames - firstFrameOf(whole);
  const two = (n: number) => String(n).padStart(2, '0');
  return {
    negative: seconds < 0 && frames > 0,
    hh: two(Math.floor(whole / 3600)),
    mm: two(Math.floor((whole % 3600) / 60)),
    ss: two(whole % 60),
    ff: two(within),
  };
};

/** Seconds as every time the studio shows them: `HH:MM:SS:FF` at `fps` (`00:01:05:12`), `−` before zero. */
export const timecode = (seconds: number, fps: number = FILM_FPS): string => {
  const p = timecodeParts(seconds, fps);
  const sign = ['−'].filter(() => p.negative).join('');
  return `${sign}${p.hh}:${p.mm}:${p.ss}:${p.ff}`;
};

/**
 * Seconds as a length is said to the owner, to the nearest second: `m:ss`
 * (`8:46`), and `h:mm:ss` past an hour (`1:02:05`). A film's card, a video
 * at rest and a draft's spoken time all say it so; the studio's own clocks
 * say `timecode`.
 */
export const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const ss = String(whole % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
};

/** A stretch of time, `from` to `to`, in seconds on whatever clock it is read against. */
export interface Interval {
  readonly from: number;
  readonly to: number;
}

/**
 * Seconds (or pixels) to the millisecond, as every file the tools write keeps
 * them: one rounding, so a value read back compares equal to the one written.
 * Never −0, which would print as `-0` in a scene module.
 */
export const toMs = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/**
 * How far off a step of a time grid (a frame, a millisecond) a time may lie
 * and still be on that step: the float noise of seconds times a rate. A time
 * already on the grid reads as its own step, never the one after, so a time
 * rounded onto the grid and read again never creeps.
 */
const GRID_NUDGE = 1e-6;

/** The first frame at or after `t` seconds, at `fps` (a millisecond's index at 1000). */
export const frameAtOrAfter = (t: number, fps: number): number => Math.ceil(t * fps - GRID_NUDGE);

/** The last frame at or before `t` seconds, at `fps`. */
export const frameAtOrBefore = (t: number, fps: number): number => Math.floor(t * fps + GRID_NUDGE);

/** The frames that start inside `span` at `fps`: the first at or after its start, the last before its end. */
export const framesOf = (span: Interval, fps: number) => ({
  first: frameAtOrAfter(span.from, fps),
  last: frameAtOrAfter(span.to, fps) - 1,
});

/**
 * `T` to the millisecond, rounded up: an in point, and `#t=` (`Places`,
 * core/api.ts), so a reload reads a time back in its own frame and never
 * before it. A scene's start that falls between two milliseconds (`]` seeks
 * there exactly) would read back in the scene before.
 */
export const onTheMs = (T: number): number => frameAtOrAfter(T, 1000) / 1000;

/**
 * How far apart two times on a scene's clock may be and still be one time: a
 * sum of seconds (a mark plus an offset) carries float noise in its last bits
 * (0.1 + 0.2 is 0.30000000000000004), far below the millisecond a file keeps.
 */
export const CLOCK_EPSILON = 1e-9;

/** The finest time a file keeps. */
const MILLISECOND = 1e-3;

/**
 * Whether a word is heard at or after `mark`: its start is on the mark, or
 * within a millisecond before it (a mark and a word both sit on a file's
 * milliseconds, so a word aligned to the mark reads as at it).
 */
export const heardAtOrAfter = (word: { readonly start: number }, mark: number): boolean =>
  word.start >= mark - MILLISECOND;

/** The last instant a span ending at `T` still holds: a millisecond before it. */
export const justBefore = (T: number): number => T - MILLISECOND;

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
  // Pinned at 1: cos(π/2) lands at ~6e-17, which would read as "not quite there".
  inSine: (t) => (t >= 1 ? 1 : 1 - Math.cos((Math.PI * t) / 2)),
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

/** The ease a cue, a `progress` or a keyframe declares none of. */
export const DEFAULT_EASE = 'inOutCubic' satisfies keyof typeof ease;

/** 0→1 over [start, start + dur], eased. Before start: 0. After: 1. */
export const progress = (t: number, start: number, dur: number, e: Ease = ease[DEFAULT_EASE]) =>
  dur <= 0 ? (t >= start ? 1 : 0) : e(clamp((t - start) / dur));

/**
 * A walker's bob, in units (+ up), while the `walk` span runs and 0 outside
 * it: a step every π/7 s counted from the span's start, each rising up to 5
 * units, so the bob starts from rest and never jumps as the walk begins.
 */
export const gait = (t: number, walk: { readonly start: number; readonly end: number }): number =>
  t > walk.start && t < walk.end ? Math.abs(Math.sin((t - walk.start) * 7)) * 5 : 0;

/**
 * 0→1 for the item at `at` (0 the first, 1 the last) of a set spread over a
 * progress `p`: the items' starts spread over the first `share` of `p` and
 * each lasts the rest, so the last ends with it. A set's own stagger, for
 * sets that take a number (`dawn`'s land, the roof's tiles); a scene reads
 * a cue's with `f.stagger` or `f.staggerAt`, where the lab can reach it.
 * A `share` of 1 starts every item at once, at its place.
 */
export const staggered = (p: number, at: number, share: number): number =>
  share >= 1 ? (p >= at ? 1 : 0) : clamp((p - share * at) / (1 - share));

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
