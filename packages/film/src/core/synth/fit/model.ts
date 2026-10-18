// An earshot fit, as its model JSON holds it (earshot 0.2.0, `auto.save`):
// only the fields the translation reads, decoded at the boundary, since the
// model is written by downloaded code. Three kinds:
//
// - modal: strikes of damped sines (each mode `[hz, tau, amplitude, phase]`,
//   a·exp(−t/tau)·cos(2πf·t + phase) from its strike) over band noise, each
//   band a `[secs, dB]` power envelope;
// - sines: partial tracks (frequency and level points), transients (damped
//   sines from their time) and third-octave residual bands;
// - spectral_noise: a bed, 48 noise bands over keyframes on a warped axis, and
//   tonal ridges.
//
// Each carries its post EQ: 28 gains at the third octaves 1000·2^(k/3), k from
// −15 to 12.

import { Schema } from 'effect';

const Finite = Schema.Finite;
const Secs = Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** `[seconds, value]`: a breakpoint. */
const Point = Schema.Tuple([Finite, Finite]);
export type Point = readonly [number, number];

/** `[hz, tau, amplitude, phase]`: a damped sine; a negative amplitude is half a turn of phase. */
const Mode = Schema.Tuple([Finite, Finite, Finite, Finite]);

/**
 * The post stage: an EQ at the third octaves, its gain (the render is peaked,
 * so it is not read) and its attack clamp (`pre`, a stored envelope of the
 * source's onset), which a code sound cannot carry: only its presence is read.
 */
const Post = Schema.Struct({
  eq_db: Schema.optionalKey(Schema.Array(Finite)),
  pre: Schema.optionalKey(Schema.Unknown),
});

/** Read only for whether it is there: what a fit leaves out. */
const present = Schema.optionalKey(Schema.Unknown);
const channels = Schema.optionalKey(Schema.Finite);

const post = Schema.optionalKey(Schema.NullOr(Post));

const Modal = Schema.Struct({
  kind: Schema.Literal('modal'),
  length_s: Secs,
  fade_out_s: Schema.optionalKey(Schema.NullOr(Secs)),
  strikes: Schema.Array(
    Schema.Struct({
      t: Secs,
      ramp_ms: Secs,
      modes: Schema.Array(Mode),
      /** The contact's modes: rung at once, no ramp. */
      attack: Schema.optionalKey(Schema.NullOr(Schema.Array(Mode))),
    }),
  ),
  /** Its residual under 20 Hz, a stored waveform. */
  sub: present,
  channels,
  noise: Schema.Struct({
    /** The bands' edges in Hz: the lowest band runs from 0, the highest to the Nyquist. */
    edges: Schema.Array(Finite),
    env: Schema.Array(Schema.Array(Point)),
  }),
  post,
});
export type Modal = typeof Modal.Type;

const Sines = Schema.Struct({
  kind: Schema.Literal('sines'),
  duration: Secs,
  channels,
  onsets: Schema.optionalKey(Schema.NullOr(Schema.Array(Finite))),
  partials: Schema.Array(
    Schema.Struct({
      t0: Secs,
      t1: Secs,
      rel: Secs,
      rise: Secs,
      ph: Finite,
      freq: Schema.NonEmptyArray(Point),
      amp: Schema.NonEmptyArray(Point),
    }),
  ),
  transients: Schema.Array(Schema.Struct({ t: Finite, atoms: Schema.Array(Mode) })),
  residual: Schema.Struct({
    /** Each band's centre in Hz. */
    bands: Schema.Array(Finite),
    times: Schema.Array(Finite),
    /** Each band's power in dB at each time. */
    db: Schema.Array(Schema.Array(Finite)),
  }),
  post,
});
export type Sines = typeof Sines.Type;

const Spectral = Schema.Struct({
  kind: Schema.Literal('spectral_noise'),
  dur: Secs,
  /** Its stereo image and its grains and AM. */
  stereo: present,
  texture: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        am: Schema.optionalKey(Schema.Unknown),
        grains: Schema.optionalKey(Schema.Unknown),
      }),
    ),
  ),
  bands: Schema.Struct({
    n: Schema.Int.check(Schema.isGreaterThan(1)),
    f_lo: Finite,
    f_hi: Finite,
  }),
  /** Keyframes: their times, and each one's density in dB for every band. */
  env: Schema.Struct({ t: Schema.Array(Finite), db: Schema.Array(Schema.Array(Finite)) }),
  ridges: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          t: Schema.NonEmptyArray(Finite),
          f: Schema.NonEmptyArray(Finite),
          db: Schema.NonEmptyArray(Finite),
        }),
      ),
    ),
  ),
  post,
});
export type Spectral = typeof Spectral.Type;

/** An earshot model this translation reads, by its `kind`. */
const EarshotModel = Schema.Union([Modal, Sines, Spectral]).pipe(Schema.toTaggedUnion('kind'));
export type EarshotModel = typeof EarshotModel.Type;

/** A model as earshot writes it: JSON text. */
export const EarshotModelJson = Schema.fromJsonString(EarshotModel);
