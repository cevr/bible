// A signal drawn, then a value at every frame. The plan pass draws a signal's
// numbers (a ramp's ends, the points, an LFO's phase) into a `Track`; the fill
// pass writes it out frame by frame into an array the renderer owns. A pitch
// moves in its logarithm unless its curve is linear, and is moved by
// semitones; every other unit moves and is moved in itself.

import { Match, Predicate } from 'effect';
import { rng } from '../../random.ts';
import { type Draws, drawValue, plain, streamSeed, uniform } from './draw.ts';
import { cosTurn, exp, exp2, log, sinTurn } from './math.ts';
import type { Curve, Lfo, Points, Ramp, Signal, Value, Wobble } from './nodes.ts';
import { SYNTH_RATE, framesOf } from './units.ts';

/** How a field's values read as numbers, and whether they are pitches (Hz, moved in octaves). */
export interface Unit<U> {
  readonly toNumber: (u: U) => number;
  readonly pitch: boolean;
}

/** Any field that is a plain number. */
export const PLAIN: Unit<number> = { toNumber: plain, pitch: false };

interface PointsTrack {
  readonly _tag: 'Points';
  /** Each point's frame, none before the one before it. */
  readonly at: ReadonlyArray<number>;
  readonly values: ReadonlyArray<number>;
  readonly curve: Curve;
  readonly pitch: boolean;
}

interface WobbleTrack {
  readonly _tag: 'Wobble';
  readonly around: number;
  readonly depth: number;
  readonly rate: number;
  readonly seed: number;
  readonly pitch: boolean;
}

interface LfoTrack {
  readonly _tag: 'Lfo';
  readonly around: number;
  readonly depth: number;
  readonly rate: number;
  readonly phase: number;
  readonly wave: 'sine' | 'triangle';
  readonly pitch: boolean;
}

/** A signal with its numbers drawn: what the fill pass writes out. */
export type Track =
  | { readonly _tag: 'Held'; readonly value: number }
  | PointsTrack
  | WobbleTrack
  | LfoTrack;

/** The smallest value an exponential curve moves from or to, as Web Audio floors it. */
const EXP_FLOOR = 1e-4;

type Moved<U> = Ramp<U> | Points<U> | Wobble<U> | Lfo<U>;

const MOVED = ['Ramp', 'Points', 'Wobble', 'Lfo'] as const;

const isMoved = <U>(signal: Signal<U>): signal is Moved<U> =>
  MOVED.some((tag) => Predicate.isTagged(signal, tag));

/** A ramp as two points: its start at frame 0, its end at `secs` (the node's length when absent). */
const rampTrack = <U>(
  ramp: Ramp<U>,
  unit: Unit<U>,
  draws: Draws,
  field: string,
  frames: number,
): Track => ({
  _tag: 'Points',
  at: [
    0,
    ramp.secs === undefined
      ? frames
      : framesOf(drawValue(ramp.secs, plain, draws, `${field}.secs`)),
  ],
  values: [
    drawValue(ramp.from, unit.toNumber, draws, `${field}.from`),
    drawValue(ramp.to, unit.toNumber, draws, `${field}.to`),
  ],
  curve: ramp.curve,
  pitch: unit.pitch,
});

/** `[secs, value]` points drawn: each point's frame, held at the one before it if drawn earlier. */
export const pointsTrack = <U>(
  points: ReadonlyArray<readonly [Value<number>, Value<U>]>,
  curve: Curve,
  unit: Unit<U>,
  draws: Draws,
  field: string,
): Track => {
  const at: Array<number> = [];
  const values: Array<number> = [];
  points.forEach(([secs, v], j) => {
    const frame = framesOf(drawValue(secs, plain, draws, `${field}.${j}.secs`));
    at.push(Math.max(frame, at[j - 1] ?? 0));
    values.push(drawValue(v, unit.toNumber, draws, `${field}.${j}.value`));
  });
  return { _tag: 'Points', at, values, curve, pitch: unit.pitch };
};

/** A signal drawn for a node `frames` long: its numbers taken from the streams of `field`. */
export const drawTrack = <U>(
  signal: Signal<U>,
  unit: Unit<U>,
  draws: Draws,
  field: string,
  frames: number,
): Track => {
  if (!isMoved(signal))
    return { _tag: 'Held', value: drawValue(signal, unit.toNumber, draws, field) };
  return Match.valueTags(signal, {
    Ramp: (ramp): Track => rampTrack(ramp, unit, draws, field, frames),
    Points: (p): Track => pointsTrack(p.points, p.curve, unit, draws, field),
    Wobble: (w): Track => ({
      _tag: 'Wobble',
      around: drawValue(w.around, unit.toNumber, draws, `${field}.around`),
      depth: drawValue(w.depth, plain, draws, `${field}.depth`),
      rate: drawValue(w.rate, plain, draws, `${field}.rate`),
      seed: streamSeed(draws.seed, `${field}.wobble`),
      pitch: unit.pitch,
    }),
    Lfo: (lfo): Track => ({
      _tag: 'Lfo',
      around: drawValue(lfo.around, unit.toNumber, draws, `${field}.around`),
      depth: drawValue(lfo.depth, plain, draws, `${field}.depth`),
      rate: drawValue(lfo.rate, plain, draws, `${field}.rate`),
      phase: uniform(draws.seed, `${field}.phase`),
      wave: lfo.wave,
      pitch: unit.pitch,
    }),
  });
};

/** The held value of a track that never moves, else undefined. */
export const heldOf = (track: Track): number | undefined =>
  track._tag === 'Held' ? track.value : undefined;

/** The raised cosine of `t` in [0, 1]: 0 at 0, 1 at 1, flat at both. */
const smoothstep = (t: number): number => (1 - cosTurn(t / 2)) / 2;

/**
 * Frames `from` to `to` (before `n`) moving from `a` to `b`: evenly, or in
 * their logarithm (an exponential curve, or a pitch that is not linear),
 * evenly or by a raised cosine.
 */
const writeSegment = (
  out: Float64Array,
  span: { readonly from: number; readonly to: number; readonly n: number },
  a: number,
  b: number,
  track: PointsTrack,
) => {
  const { from, to } = span;
  const width = to - from;
  const geometric = track.curve === 'exponential' || (track.pitch && track.curve !== 'linear');
  const ease = track.curve === 'smooth' ? smoothstep : plain;
  const la = log(Math.max(a, EXP_FLOOR));
  const lb = log(Math.max(b, EXP_FLOOR));
  for (let i = from; i < Math.min(span.n, to); i++) {
    const s = ease((i - from) / width);
    out[i] = geometric ? exp(la + (lb - la) * s) : a + (b - a) * s;
  }
};

/** A points track written out: the first value before the first point, the last from the last on. */
const writePoints = (track: PointsTrack, out: Float64Array, n: number) => {
  const last = track.values.length - 1;
  out.fill(track.values[0] ?? 0, 0, Math.min(n, track.at[0] ?? 0));
  for (let j = 0; j < last; j++) {
    const span = { from: track.at[j] ?? 0, to: track.at[j + 1] ?? 0, n };
    writeSegment(out, span, track.values[j] ?? 0, track.values[j + 1] ?? 0, track);
  }
  out.fill(track.values[last] ?? 0, Math.min(n, track.at[last] ?? 0), n);
};

/** `around` moved by `by` in its unit: a pitch by semitones, any other by adding. */
const moved = (around: number, by: number, pitch: boolean): number =>
  pitch ? around * exp2(by / 12) : around + by;

/** Smooth value noise in [−1, 1): knots `rate` a second, drawn in order, smoothstepped between. */
const writeWobble = (track: WobbleTrack, out: Float64Array, n: number) => {
  const step = track.rate / SYNTH_RATE;
  const r = rng(track.seed);
  const knots = new Float64Array(Math.floor(n * step) + 2);
  for (let j = 0; j < knots.length; j++) knots[j] = r() * 2 - 1;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const f = x - j;
    const a = knots[j] ?? 0;
    const m = a + ((knots[j + 1] ?? 0) - a) * f * f * (3 - 2 * f);
    out[i] = moved(track.around, track.depth * m, track.pitch);
  }
};

/** A triangle in [−1, 1] of a phase in turns, rising through 0 at 0 as a sine does. */
export const triangle = (t: number): number => {
  const u = t + 0.25;
  return 1 - 4 * Math.abs(u - Math.floor(u) - 0.5);
};

const writeLfo = (track: LfoTrack, out: Float64Array, n: number) => {
  const step = track.rate / SYNTH_RATE;
  const wave = track.wave === 'sine' ? sinTurn : triangle;
  for (let i = 0; i < n; i++)
    out[i] = moved(track.around, track.depth * wave(track.phase + i * step), track.pitch);
};

/** A track's first `n` frames, written into `out`. */
export const writeTrack = (track: Track, out: Float64Array, n: number): void =>
  Match.valueTags(track, {
    Held: (held) => {
      out.fill(held.value, 0, n);
    },
    Points: (points) => writePoints(points, out, n),
    Wobble: (wobble) => writeWobble(wobble, out, n),
    Lfo: (lfo) => writeLfo(lfo, out, n),
  });
