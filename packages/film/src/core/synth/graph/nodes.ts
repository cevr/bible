// A code sound as data: a tree of nodes, each field named for its unit, that
// renders to the same samples for the same seed on every host (render.ts).
// Sources make sound, shapers and the filter change one child, space adds a
// tail to one, and time places several. The tree is finite: feedback lives only
// inside a Delay and a Reverb.
//
// A parameter is a `Value`, drawn once per render (a constant, a range, a
// choice), or a `Signal`, a value at every frame (a Value held, a ramp, points,
// a wobble, an LFO). A field fixed for a render takes a Value, so a shape in
// time cannot reach it.

import { Predicate, Schema } from 'effect';
import { NOTE_NAME } from './pitch.ts';
import { MAX_CODE_SECS } from './units.ts';

// Units, each a field's own.

/** Seconds: a length, an offset, a time constant. */
const Secs = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: MAX_CODE_SECS }));
/** A level from 0 to 1: an amplitude, a mix, a duty cycle. */
const Level = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
/** A gain in dB. */
const Db = Schema.Finite.check(Schema.isBetween({ minimum: -120, maximum: 48 }));
/** A frequency or a rate, in Hz, up to the mix's Nyquist. */
const Hz = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 22050, exclusiveMinimum: true }),
);
/** A pitch shift, in semitones. */
const Semitones = Schema.Finite.check(Schema.isBetween({ minimum: -48, maximum: 48 }));
/** A filter's Q. */
const Q = Schema.Finite.check(Schema.isBetween({ minimum: 0.05, maximum: 100 }));
/** A modulation's depth, in its field's modulation unit (semitones, dB, the field's own). */
const Depth = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
/** A positive factor: a decay's scale. */
const Factor = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 100, exclusiveMinimum: true }),
);

/** A note by name: letter, optional sharp or flat, octave 0 to 8 (`D5`, `F#3`, `Bb2`). */
const NoteName = Schema.String.check(
  Schema.makeFilter(
    (note: string) => NOTE_NAME.test(note) || `"${note}" is no note name of octaves 0 to 8`,
  ),
);

/** A degree of the sound's key, counted from its tonic in that octave (past the scale's top, the next octave's). */
export interface Degree {
  readonly degree: number;
  readonly octave: number;
}
const Degree: Schema.Codec<Degree> = Schema.Struct({
  degree: Schema.Int.check(Schema.isBetween({ minimum: -48, maximum: 48 })),
  octave: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 8 })),
});

/** A pitch: Hz, a note name, or a degree of the key. */
export type Pitch = number | string | Degree;
const Pitch: Schema.Codec<Pitch> = Schema.Union([Hz, NoteName, Degree]);

/** The scales a key can name. */
const SCALES = ['majorPentatonic', 'major', 'minor', 'minorPentatonic'] as const;

/** The scale a sound's degree pitches count in: a tonic and a scale. */
export interface Key {
  readonly tonic: string;
  readonly scale: (typeof SCALES)[number];
}
const Key: Schema.Codec<Key> = Schema.Struct({
  tonic: Schema.String.check(Schema.isPattern(/^[A-G](#|b)?$/)),
  scale: Schema.Literals(SCALES),
});

// Parameters.

/** A value drawn evenly between `min` and `max` (`log`: evenly in their logarithm). */
interface Vary<U> {
  readonly _tag: 'Vary';
  readonly min: U;
  readonly max: U;
  readonly curve?: 'linear' | 'log';
}

/** One of `of`: the variant's own (variant n plays `of[(n − 1) mod k]`), or drawn by chance. */
export interface Pick<U> {
  readonly _tag: 'Pick';
  readonly of: readonly [U, ...Array<U>];
  readonly by: 'seed' | 'chance';
}

/** A value drawn once per render. */
export type Value<U> = U | Vary<U> | Pick<U>;

export const isVary = <U>(value: Value<U>): value is Vary<U> => Predicate.isTagged(value, 'Vary');

export const isPick = <U>(value: Value<U>): value is Pick<U> => Predicate.isTagged(value, 'Pick');

/**
 * How a signal moves between two values: evenly, geometrically, or by a
 * raised cosine. A geometric move is between values of 0 or more, 0 taken as
 * 1e-4 (−80 dB), as Web Audio floors it.
 */
export type Curve = 'linear' | 'exponential' | 'smooth';
const Curve = Schema.Literals(['linear', 'exponential', 'smooth']);

/** Each value a `Value` can draw: a constant, a range's two ends, a choice's every one. */
export const drawable = <U>(value: Value<U>): ReadonlyArray<U> => {
  if (isPick(value)) return value.of;
  if (isVary(value)) return [value.min, value.max];
  return [value];
};

/** Whether `curve` can move between `values`: an exponential one only between numbers of 0 or more. */
const curveFits = <U>(curve: Curve, values: ReadonlyArray<Value<U>>): boolean =>
  curve !== 'exponential' ||
  values.flatMap(drawable).every((u) => !Predicate.isNumber(u) || u >= 0);

const CURVE_FITS = { expected: 'an exponential curve between values of 0 or more' };

/** From one value to another over `secs` (the node's length when absent), then held. */
export interface Ramp<U> {
  readonly _tag: 'Ramp';
  readonly from: Value<U>;
  readonly to: Value<U>;
  readonly secs?: Value<number>;
  readonly curve: Curve;
}

/** Through `[secs, value]` points: the first held before it, the last after. */
export interface Points<U> {
  readonly _tag: 'Points';
  readonly points: readonly [
    readonly [Value<number>, Value<U>],
    ...Array<readonly [Value<number>, Value<U>]>,
  ];
  readonly curve: Curve;
}

/** Smooth seeded value noise: `around` moved by up to ± `depth`, about `rate` times a second. */
export interface Wobble<U> {
  readonly _tag: 'Wobble';
  readonly around: Value<U>;
  readonly depth: Value<number>;
  readonly rate: Value<number>;
}

/** A low oscillator: `around` moved by ± `depth` at `rate` Hz, from a seeded phase. */
export interface Lfo<U> {
  readonly _tag: 'Lfo';
  readonly around: Value<U>;
  readonly depth: Value<number>;
  readonly rate: Value<number>;
  readonly wave: 'sine' | 'triangle';
}

/** A value at every frame. */
export type Signal<U> = Value<U> | Ramp<U> | Points<U> | Wobble<U> | Lfo<U>;

/** Whether a bound can be drawn in its logarithm: a pitch always, a number above 0. */
const logBound = <U>(u: U): boolean => !Predicate.isNumber(u) || u > 0;

const value = <U>(unit: Schema.Codec<U>): Schema.Codec<Value<U>> =>
  Schema.Union([
    unit,
    Schema.TaggedStruct('Vary', {
      min: unit,
      max: unit,
      curve: Schema.optionalKey(Schema.Literals(['linear', 'log'])),
    }).check(
      Schema.makeFilter(
        (vary) => vary.curve !== 'log' || (logBound(vary.min) && logBound(vary.max)),
        { expected: 'a log range above 0' },
      ),
    ),
    Schema.TaggedStruct('Pick', {
      of: Schema.NonEmptyArray(unit),
      by: Schema.Literals(['seed', 'chance']),
    }),
  ]);

const signal = <U>(unit: Schema.Codec<U>): Schema.Codec<Signal<U>> => {
  const held = value(unit);
  const moved = {
    around: held,
    depth: value(Depth),
    rate: value(Hz),
  };
  return Schema.Union([
    held,
    Schema.TaggedStruct('Ramp', {
      from: held,
      to: held,
      secs: Schema.optionalKey(value(Secs)),
      curve: Curve,
    }).check(Schema.makeFilter((ramp) => curveFits(ramp.curve, [ramp.from, ramp.to]), CURVE_FITS)),
    Schema.TaggedStruct('Points', {
      points: Schema.NonEmptyArray(Schema.Tuple([value(Secs), held])),
      curve: Curve,
    }).check(
      Schema.makeFilter(
        (points) =>
          curveFits(
            points.curve,
            points.points.map(([, v]) => v),
          ),
        CURVE_FITS,
      ),
    ),
    Schema.TaggedStruct('Wobble', moved),
    Schema.TaggedStruct('Lfo', { ...moved, wave: Schema.Literals(['sine', 'triangle']) }),
  ]);
};

// Nodes.

/** A name that keeps a node's draws when nodes are put before it: unique in its sound. */
const StreamName = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9.-]*$/));

/**
 * A struck mode: its ratio to the pitch, its level, its decay's time constant
 * in seconds, and where its cycle starts, in turns (drawn when absent). A
 * fitted sound names each phase: close modes of opposite phase cancel as the
 * recording did, where drawn phases would add them up.
 */
interface Partial {
  readonly ratio: number;
  readonly level: number;
  readonly decay: number;
  readonly phase?: number;
}
const Partial: Schema.Codec<Partial> = Schema.Struct({
  ratio: Factor,
  level: Level,
  decay: Schema.Finite.check(Schema.isBetween({ minimum: 0.0001, maximum: MAX_CODE_SECS })),
  phase: Schema.optionalKey(Level),
});

/** The named sets of struck modes: a wine glass, a small bell. */
export const PARTIAL_SETS = ['glass', 'bell'] as const;

/** A tone: a band-limited wave at a pitch. */
export interface Osc {
  readonly _tag: 'Osc';
  readonly wave: 'sine' | 'triangle' | 'saw' | 'square';
  readonly pitch: Signal<Pitch>;
  /** A square's share of its cycle high (0.5 when absent). */
  readonly duty?: Signal<number>;
  readonly secs: Value<number>;
  /** Where the cycle starts, in turns, or drawn (`random`, when absent). */
  readonly phase?: 'random' | number;
  readonly stream?: string;
}

/** Noise: white, pink (−3 dB an octave) or brown (a leaky walk). */
export interface Noise {
  readonly _tag: 'Noise';
  readonly color: 'white' | 'pink' | 'brown';
  readonly secs: Value<number>;
  readonly stream?: string;
}

/** Struck modes: a sine per partial, a linear attack, an exponential decay, a phase its own or drawn. */
export interface Partials {
  readonly _tag: 'Partials';
  readonly pitch: Value<Pitch>;
  readonly set: (typeof PARTIAL_SETS)[number] | readonly [Partial, ...Array<Partial>];
  /** The attack in seconds (0.006 when absent). */
  readonly attack?: Value<number>;
  /** Each decay scaled by this (1 when absent). */
  readonly decayScale?: Value<number>;
  readonly secs: Value<number>;
  readonly stream?: string;
}

/** Another code sound of the library, rendered alone (peaked) with its own seed: `seed`, or one drawn. */
export interface Sample {
  readonly _tag: 'Sample';
  readonly sound: string;
  readonly seed?: number;
  readonly stream?: string;
}

/** Its child times a gain in dB. */
export interface Gain {
  readonly _tag: 'Gain';
  readonly db: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child times a level through `[secs, level]` points, the last held to the end. */
export interface Envelope {
  readonly _tag: 'Envelope';
  readonly points: readonly [
    readonly [Value<number>, Value<number>],
    ...Array<readonly [Value<number>, Value<number>]>,
  ];
  readonly curve: Curve;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child faded in over its first `in` seconds and out over its last `out` (linear). */
export interface Fade {
  readonly _tag: 'Fade';
  readonly in?: Value<number>;
  readonly out?: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child driven by a gain in dB into a curve: tanh, a soft cubic, a hard clip, or a fold. */
export interface Drive {
  readonly _tag: 'Drive';
  readonly db: Signal<number>;
  readonly transfer: 'tanh' | 'soft' | 'hard' | 'fold';
  readonly of: Node;
  readonly stream?: string;
}

/** Its child at fewer bits, or held at a lower rate (sample and hold). */
export interface Crush {
  readonly _tag: 'Crush';
  readonly bits?: Value<number>;
  readonly hz?: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child played faster or slower by `semitones` (varispeed: its length scales too). */
export interface Resample {
  readonly _tag: 'Resample';
  readonly semitones: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** The kinds of filter, the Audio EQ Cookbook's. */
export const FILTERS = [
  'lowpass',
  'highpass',
  'bandpass',
  'notch',
  'peak',
  'lowshelf',
  'highshelf',
  'allpass',
] as const;

/** Its child through a biquad whose frequency, Q and gain may move (recomputed every `CONTROL` frames). */
export interface Filter {
  readonly _tag: 'Filter';
  readonly type: (typeof FILTERS)[number];
  readonly hz: Signal<Pitch>;
  readonly q: Signal<number>;
  /** A peak's or a shelf's gain in dB (0 when absent). */
  readonly db?: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child with an echo `secs` behind, fed back by `feedback`, mixed in by `wet`, ringing on for `tail`. */
export interface Delay {
  readonly _tag: 'Delay';
  readonly secs: Signal<number>;
  readonly feedback: Value<number>;
  readonly wet: Value<number>;
  readonly tail: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child in a room (a mono Freeverb): `size` its combs' feedback, `damp` their lowpass. */
export interface Reverb {
  readonly _tag: 'Reverb';
  readonly size: Value<number>;
  readonly damp: Value<number>;
  readonly wet: Value<number>;
  readonly tail: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** Its child made to loop: its last `crossfade` seconds crossfaded (equal power) into its head. */
export interface Loop {
  readonly _tag: 'Loop';
  readonly crossfade: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

/** A child of a layer: its node, where it starts and its gain. */
interface Layered {
  readonly node: Node;
  readonly at?: Value<number>;
  readonly db?: Value<number>;
}

/**
 * Its children mixed, each from its `at`: `secs` long when it names one (a
 * child cut there, as a buffer of that length holds what is added into it),
 * else to its latest child's end.
 */
export interface Layer {
  readonly _tag: 'Layer';
  readonly of: readonly [Layered, ...Array<Layered>];
  readonly secs?: Value<number>;
  readonly stream?: string;
}

/** Its children one after another, `gap` seconds between each two (drawn per join). */
export interface Sequence {
  readonly _tag: 'Sequence';
  readonly of: readonly [Node, ...Array<Node>];
  readonly gap?: Value<number>;
  readonly stream?: string;
}

/** `count` onsets, `every` seconds apart. */
interface Count {
  readonly _tag: 'Count';
  readonly every: Value<number>;
  readonly count: Value<number>;
}

/** Onsets `every` seconds apart, for `secs`. */
interface During {
  readonly _tag: 'During';
  readonly every: Value<number>;
  readonly secs: Value<number>;
}

/** Onsets at random, `rate` a second on average (Poisson), for `secs`. */
interface Poisson {
  readonly _tag: 'Poisson';
  readonly rate: Value<number>;
  readonly secs: Value<number>;
}

/** Its child again and again: each repetition on its own stream, so each tick varies. */
export interface Repeat {
  readonly _tag: 'Repeat';
  readonly of: Node;
  readonly timing: Count | During | Poisson;
  readonly stream?: string;
}

/** A node of a code sound. */
export type Node =
  | Osc
  | Noise
  | Partials
  | Sample
  | Gain
  | Envelope
  | Fade
  | Drive
  | Crush
  | Resample
  | Filter
  | Delay
  | Reverb
  | Loop
  | Layer
  | Sequence
  | Repeat;

const Child = Schema.suspend((): Schema.Codec<Node> => Node);
const stream = Schema.optionalKey(StreamName);
const Every = Schema.Finite.check(Schema.isBetween({ minimum: 0.005, maximum: MAX_CODE_SECS }));

const Osc: Schema.Codec<Osc> = Schema.TaggedStruct('Osc', {
  wave: Schema.Literals(['sine', 'triangle', 'saw', 'square']),
  pitch: signal(Pitch),
  duty: Schema.optionalKey(signal(Level)),
  secs: value(Secs),
  phase: Schema.optionalKey(Schema.Union([Schema.Literal('random'), Level])),
  stream,
});

const Noise: Schema.Codec<Noise> = Schema.TaggedStruct('Noise', {
  color: Schema.Literals(['white', 'pink', 'brown']),
  secs: value(Secs),
  stream,
});

const Partials: Schema.Codec<Partials> = Schema.TaggedStruct('Partials', {
  pitch: value(Pitch),
  set: Schema.Union([Schema.Literals(PARTIAL_SETS), Schema.NonEmptyArray(Partial)]),
  attack: Schema.optionalKey(value(Secs)),
  decayScale: Schema.optionalKey(value(Factor)),
  secs: value(Secs),
  stream,
});

const Sample: Schema.Codec<Sample> = Schema.TaggedStruct('Sample', {
  sound: Schema.String,
  seed: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  stream,
});

const Gain: Schema.Codec<Gain> = Schema.TaggedStruct('Gain', { db: signal(Db), of: Child, stream });

const Envelope: Schema.Codec<Envelope> = Schema.TaggedStruct('Envelope', {
  points: Schema.NonEmptyArray(Schema.Tuple([value(Secs), value(Level)])),
  curve: Curve,
  of: Child,
  stream,
});

const Fade: Schema.Codec<Fade> = Schema.TaggedStruct('Fade', {
  in: Schema.optionalKey(value(Secs)),
  out: Schema.optionalKey(value(Secs)),
  of: Child,
  stream,
});

const Drive: Schema.Codec<Drive> = Schema.TaggedStruct('Drive', {
  db: signal(Db),
  transfer: Schema.Literals(['tanh', 'soft', 'hard', 'fold']),
  of: Child,
  stream,
});

const Crush: Schema.Codec<Crush> = Schema.TaggedStruct('Crush', {
  bits: Schema.optionalKey(value(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })))),
  hz: Schema.optionalKey(signal(Hz)),
  of: Child,
  stream,
});

const Resample: Schema.Codec<Resample> = Schema.TaggedStruct('Resample', {
  semitones: value(Semitones),
  of: Child,
  stream,
});

const Filter: Schema.Codec<Filter> = Schema.TaggedStruct('Filter', {
  type: Schema.Literals(FILTERS),
  hz: signal(Pitch),
  q: signal(Q),
  db: Schema.optionalKey(signal(Db)),
  of: Child,
  stream,
});

const Delay: Schema.Codec<Delay> = Schema.TaggedStruct('Delay', {
  secs: signal(Schema.Finite.check(Schema.isBetween({ minimum: 1 / 44100, maximum: 2 }))),
  feedback: value(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 0.95 }))),
  wet: value(Level),
  tail: value(Secs),
  of: Child,
  stream,
});

const Reverb: Schema.Codec<Reverb> = Schema.TaggedStruct('Reverb', {
  size: value(Level),
  damp: value(Hz),
  wet: value(Level),
  tail: value(Secs),
  of: Child,
  stream,
});

const Loop: Schema.Codec<Loop> = Schema.TaggedStruct('Loop', {
  crossfade: value(Secs),
  of: Child,
  stream,
});

const Layered: Schema.Codec<Layered> = Schema.Struct({
  node: Child,
  at: Schema.optionalKey(value(Secs)),
  db: Schema.optionalKey(value(Db)),
});

const Layer: Schema.Codec<Layer> = Schema.TaggedStruct('Layer', {
  of: Schema.NonEmptyArray(Layered),
  secs: Schema.optionalKey(value(Secs)),
  stream,
});

const Sequence: Schema.Codec<Sequence> = Schema.TaggedStruct('Sequence', {
  of: Schema.NonEmptyArray(Child),
  gap: Schema.optionalKey(value(Secs)),
  stream,
});

const Repeat: Schema.Codec<Repeat> = Schema.TaggedStruct('Repeat', {
  of: Child,
  timing: Schema.Union([
    Schema.TaggedStruct('Count', {
      every: value(Every),
      count: value(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
    }),
    Schema.TaggedStruct('During', { every: value(Every), secs: value(Secs) }),
    Schema.TaggedStruct('Poisson', {
      rate: value(Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 400 }))),
      secs: value(Secs),
    }),
  ]),
  stream,
});

/** A node of a code sound: one closed union, by `_tag`. */
export const Node = Schema.Union([
  Osc,
  Noise,
  Partials,
  Sample,
  Gain,
  Envelope,
  Fade,
  Drive,
  Crush,
  Resample,
  Filter,
  Delay,
  Reverb,
  Loop,
  Layer,
  Sequence,
  Repeat,
]).pipe(Schema.toTaggedUnion('_tag'));

/** A sound made by code: its graph, and the scale its degree pitches name. */
export interface CodeSound {
  readonly key?: Key;
  readonly play: Node;
}
export const CodeSound: Schema.Codec<CodeSound> = Schema.Struct({
  key: Schema.optionalKey(Key),
  play: Child,
});
