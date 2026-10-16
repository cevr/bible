// Code sounds built from a few musical settings: each preset a function that
// gives a graph (nodes.ts), the one place its sound's shape is written. A
// preset computes its data with the graph's own maths (math.ts), so the same
// settings give the same graph, hash and samples on every host.
//
// The eight recipes of core/synth/recipes.ts are here as graphs that take the
// recipe's own settings: `portOf(recipe)` is a recipe's sound made by code,
// heard beside the recipe until the owner chooses (core/sfx.ts `codeTrialOf`).
// A recipe whose port is no code sound the library's walk takes is refused
// at its entry (core/sfx.ts), so a trial nobody wrote never fails the load.
// A port draws its numbers from the graph's streams, so its samples are new;
// its measures are the recipe's (presets.test.ts): the same length, loudness
// within 1 LU, the band balance within 1.5 dB, the same notes and partials,
// the bell's note by seed, and a loop seam heard on no more seeds.
//
// The families after them (`burst`, `thump`, `knock`, `scatter`, `whoosh`,
// `hiss`, `sizzle`, `breeze`, and `rain` with its roof) are the shapes the
// library's code sounds are built from: a few settings each, and the
// variation their seeds draw (`@bible/film/core` exports them to the app).

import type { Recipe } from '../recipes.ts';
import { dbToGain, exp, exp2, log } from './math.ts';
import type { Node, Pitch, Ramp, Value } from './nodes.ts';
import { noteMidi, pitchHz } from './pitch.ts';

/** A note name names its own pitch: the key it is read in is never used. */
const ANY_KEY = { tonic: 'C', scale: 'major' } as const;

/** dB as a natural-log factor: a gain of g dB is e^(g · DB_LN). */
const DB_LN = Math.LN10 / 20;

/** A level (an amplitude ratio) in dB. */
const db = (level: number): number => log(level) / DB_LN;

/** A note name's frequency in Hz. */
const hz = (note: string): number => pitchHz(note, ANY_KEY);

/** The twelve semitones above C, named by sharps. */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** A MIDI number's note name, by sharps. */
const nameOf = (midi: number): string => `${NAMES[midi % 12] ?? 'C'}${Math.floor(midi / 12) - 1}`;

/** The major pentatonic scale's steps above its root, in semitones. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Degree `degree` of `root`'s major pentatonic scale as a note name (past the fifth, the next octave's). */
const degreeNote = (root: string, degree: number): string => {
  const octaves = Math.floor(degree / PENTATONIC.length);
  const step = PENTATONIC[degree - octaves * PENTATONIC.length] ?? 0;
  return nameOf(noteMidi(root) + 12 * octaves + step);
};

/** Degrees 0 to `count − 1` of `root`'s major pentatonic scale, as note names. */
const degreeNotes = (root: string, count: number): readonly [string, ...Array<string>] => [
  degreeNote(root, 0),
  ...Array.from({ length: count - 1 }, (_, k) => degreeNote(root, k + 1)),
];

const pink = (secs: number): Node => ({ _tag: 'Noise', color: 'pink', secs });

const brown = (secs: number): Node => ({ _tag: 'Noise', color: 'brown', secs });

/** The recipes' fixed filters: a Butterworth Q. */
const lowpass = (at: number, of: Node): Node => ({
  _tag: 'Filter',
  type: 'lowpass',
  hz: at,
  q: 0.7,
  of,
});

const highpass = (at: number, of: Node): Node => ({
  _tag: 'Filter',
  type: 'highpass',
  hz: at,
  q: 0.7,
  of,
});

const sine = (pitch: number, secs: number): Node => ({ _tag: 'Osc', wave: 'sine', pitch, secs });

/** sinh(x) / x, 1 at 0: the mean of e^(x · u) for u even in [−1, 1]. */
const sinhc = (x: number): number => (x === 0 ? 1 : (exp(x) - exp(-x)) / (2 * x));

/** How many midpoints the mean over a wobble's knot spacing is taken at. */
const MEAN_POINTS = 64;

/**
 * The mean of e^(2c · m) over the graph's wobble m (track.ts): knots even in
 * [−1, 1), two of them weighted 1 − s and s, s the smoothstep of the place
 * between them, so the mean at s is sinhc(2c(1 − s)) · sinhc(2c · s).
 */
const wobblePower = (c: number): number => {
  let sum = 0;
  for (let j = 0; j < MEAN_POINTS; j++) {
    const f = (j + 0.5) / MEAN_POINTS;
    const s = f * f * (3 - 2 * f);
    sum += sinhc(2 * c * (1 - s)) * sinhc(2 * c * s);
  }
  return sum / MEAN_POINTS;
};

/**
 * The mean square of a recipe's gain `low + (high − low) · w` (signal.ts
 * `wobble`): its knots even in [0, 1), smoothstepped between, so E[w] = 1/2
 * and E[w²] = 1/3 − E[s]/6 + E[s²]/6 = 131/420.
 */
const recipePower = (low: number, high: number): number => {
  const d = high - low;
  return low * low + low * d + (d * d * 131) / 420;
};

/**
 * A gain that wanders as a recipe's does between two levels (amplitudes) at
 * about `rate` a second: a wobble in dB as wide as their ratio, centred where
 * its mean power is the recipe's.
 */
const swaying = (low: number, high: number, rate: number, of: Node): Node => {
  const depth = (db(high) - db(low)) / 2;
  const around = (log(recipePower(low, high)) - log(wobblePower(depth * DB_LN))) / (2 * DB_LN);
  return { _tag: 'Gain', db: { _tag: 'Wobble', around, depth, rate }, of };
};

/** A level drawn evenly between two amplitudes, as a recipe draws one: a one-point envelope. */
const levelBetween = (min: number, max: number, of: Node): Node => ({
  _tag: 'Envelope',
  points: [[0, { _tag: 'Vary', min, max }]],
  curve: 'linear',
  of,
});

/** How long a bed recipe's loop crossfade is, in seconds: it makes the bed this much longer first. */
const BED_LOOP = 1;

/** Room tone: brown body and pink hiss under a slow swell of air, made to loop. */
const room = (settings: { readonly secs: number }): Node => {
  const made = settings.secs + BED_LOOP;
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: swaying(0.85, 1.15, 0.2, {
      _tag: 'Layer',
      of: [
        { node: lowpass(300, brown(made)), db: db(0.7) },
        { node: highpass(180, lowpass(2500, pink(made))), db: db(0.25) },
      ],
    }),
  };
};

/** A struck chime on a degree of the root's major pentatonic scale: variant n rings degree n − 1. */
const chime = (settings: {
  readonly root: string;
  readonly partials: 'glass' | 'bell';
  readonly secs: number;
}): Node => ({
  _tag: 'Fade',
  in: 0.05,
  out: 0.05,
  of: {
    _tag: 'Partials',
    pitch: { _tag: 'Pick', of: degreeNotes(settings.root, PENTATONIC.length), by: 'seed' },
    set: settings.partials,
    secs: settings.secs,
  },
});

/** A low held tone: the root, its octave, its twelfth and its fifth, breathing slowly, made to loop. */
const drone = (settings: { readonly root: string; readonly secs: number }): Node => {
  const made = settings.secs + BED_LOOP;
  const root = hz(settings.root);
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: swaying(0.8, 1, 0.15, {
      _tag: 'Layer',
      of: [
        { node: sine(root, made) },
        { node: sine(root * 2, made), db: db(0.35) },
        { node: sine(root * 3, made), db: db(0.12) },
        { node: sine(root * 1.5, made), db: db(0.18) },
      ],
    }),
  };
};

/** How many straight lines draw the drain's fall. */
const DRAIN_LINES = 16;

/** The drain's rise: 30 ms. */
const DRAIN_RISE = 0.03;

/** The drain's level: up over 30 ms, then down as (1 − t/secs)^1.5 to silence at its end. */
const drainLevels = (
  secs: number,
): readonly [readonly [number, number], ...Array<readonly [number, number]>] => {
  const fall = (t: number) => {
    const y = 1 - t / secs;
    return y * Math.sqrt(y);
  };
  const lines = Array.from({ length: DRAIN_LINES }, (_, j): readonly [number, number] => {
    const t = DRAIN_RISE + ((secs - DRAIN_RISE) * j) / DRAIN_LINES;
    return [t, fall(t)];
  });
  return [[0, 0], ...lines, [secs, 0]];
};

/** A hollow tone falling from one note to another, breath following it down a band, and fading. */
const drain = (settings: {
  readonly from: string;
  readonly to: string;
  readonly secs: number;
}): Node => {
  const from = hz(settings.from);
  const to = hz(settings.to);
  const glide = (times: number): Ramp<Pitch> => ({
    _tag: 'Ramp',
    from: from * times,
    to: to * times,
    curve: 'exponential',
  });
  const secs = settings.secs;
  return {
    _tag: 'Fade',
    in: 0.01,
    out: 0.01,
    of: {
      _tag: 'Envelope',
      points: drainLevels(secs),
      curve: 'linear',
      of: {
        _tag: 'Layer',
        of: [
          { node: { _tag: 'Osc', wave: 'sine', pitch: glide(1), secs }, db: db(0.8) },
          { node: { _tag: 'Osc', wave: 'sine', pitch: glide(2), secs }, db: db(0.15) },
          {
            node: { _tag: 'Filter', type: 'bandpass', hz: glide(2), q: 3, of: pink(secs) },
            db: db(0.6),
          },
        ],
      },
    },
  };
};

/** The bloom's chord: root, third, fifth and octave, as degrees of the pentatonic scale. */
const BLOOM_DEGREES = [0, 2, 3, 5] as const;

/** A soft swell: the root's chord entering note by note under a rising shimmer. */
const bloom = (settings: { readonly root: string; readonly secs: number }): Node => {
  const secs = settings.secs;
  const shimmer: Node = {
    _tag: 'Envelope',
    points: [
      [0, 0],
      [secs / 2, 1],
      [secs, 0],
    ],
    curve: 'smooth',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: { _tag: 'Ramp', from: 2000, to: 6000, curve: 'linear' },
      q: 1.2,
      of: highpass(1500, pink(secs)),
    },
  };
  const note = (degree: number): Node => ({
    _tag: 'Envelope',
    points: [
      [0, 0],
      [0.25, 1],
    ],
    curve: 'linear',
    of: { _tag: 'Partials', pitch: degreeNote(settings.root, degree), set: 'glass', secs },
  });
  return {
    _tag: 'Fade',
    in: 0.05,
    out: 0.05,
    of: {
      _tag: 'Layer',
      secs,
      of: [
        { node: shimmer, db: db(0.25) },
        // Each note a little after the last: k · 90 ms, and up to 40 ms more.
        ...BLOOM_DEGREES.map((degree, k) => ({
          node: note(degree),
          at: { _tag: 'Vary', min: k * 0.09, max: k * 0.09 + 0.04 } as const,
          db: db(0.7 - k * 0.1),
        })),
      ],
    },
  };
};

/** A few bright plinks on two octaves of the root's scale, one after another, each ringing on. */
const notes = (settings: {
  readonly root: string;
  readonly count: number;
  readonly secs: number;
}): Node => {
  const secs = settings.secs;
  // The plinks spread over the first 70 % of the sound, each up to 60 % of its step late.
  const every = (secs * 0.7) / settings.count;
  const plink: Node = levelBetween(0.5, 1, {
    _tag: 'Partials',
    pitch: { _tag: 'Pick', of: degreeNotes(settings.root, 2 * PENTATONIC.length), by: 'chance' },
    set: 'bell',
    decayScale: 0.3,
    secs,
  });
  return {
    _tag: 'Fade',
    in: 0.05,
    out: 0.05,
    of: {
      _tag: 'Layer',
      secs,
      of: [
        {
          node: {
            _tag: 'Repeat',
            timing: { _tag: 'Count', every, count: settings.count },
            of: {
              _tag: 'Layer',
              of: [{ node: plink, at: { _tag: 'Vary', min: 0, max: 0.6 * every } }],
            },
          },
        },
      ],
    },
  };
};

/**
 * The band the wind whistles through. The recipe moves it evenly between 350
 * and 1250 Hz; a pitch moves in semitones, so here it moves as far either
 * side (their ratio), centred where its mean is the recipe's, 800 Hz.
 */
const WHISTLE = (() => {
  const depth = (6 * log(1250 / 350)) / Math.LN2;
  return { around: 800 / wobblePower((depth * Math.LN2) / 24), depth };
})();

/** Wind: brown body and pink air through a wandering band, gusting. */
const wind = (settings: { readonly secs: number }): Node => {
  const secs = settings.secs;
  return {
    _tag: 'Fade',
    in: 0.5,
    out: 0.5,
    of: swaying(0.35, 1, 0.35, {
      _tag: 'Layer',
      of: [
        { node: lowpass(500, brown(secs)), db: db(0.6) },
        {
          node: {
            _tag: 'Filter',
            type: 'bandpass',
            hz: { _tag: 'Wobble', around: WHISTLE.around, depth: WHISTLE.depth, rate: 0.8 },
            q: 2.2,
            of: pink(secs),
          },
          db: db(1.2),
        },
      ],
    }),
  };
};

/** How long rain's loop crossfade is, in seconds. */
const RAIN_LOOP = 0.5;

/** How long a drop is: 300 frames, as the recipe makes it. */
const DROP_SECS = 300 / 44100;

/** A drop's rise, and its fall's time constant, in seconds. */
const DROP_RISE = 0.0005;
const DROP_FALL = 0.002;

/** One drop: a level between 0.2 and 1, up over 0.5 ms and down over 2 ms, through a narrow band between 1.5 and 6.5 kHz. */
const DROP: Node = levelBetween(0.2, 1, {
  _tag: 'Envelope',
  points: [
    [0, 0],
    [DROP_RISE, 1],
  ],
  curve: 'linear',
  of: {
    _tag: 'Envelope',
    points: [
      [DROP_RISE, 1],
      [DROP_SECS, exp(-(DROP_SECS - DROP_RISE) / DROP_FALL)],
    ],
    curve: 'exponential',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: { _tag: 'Vary', min: 1500, max: 6500 },
      q: 6,
      of: { _tag: 'Noise', color: 'white', secs: DROP_SECS },
    },
  },
});

/** How often rain's drops fall: 176.4 a second on average (1 in 250 frames). */
const DROPS = 44100 / 250;

/** A tap on a roof tile: a drop's knock, short and bright, its pitch drawn between 1.2 and 3 kHz. */
const TAP: Node = levelBetween(0.3, 1, {
  _tag: 'Partials',
  pitch: { _tag: 'Vary', min: 1200, max: 3000, curve: 'log' },
  set: [
    { ratio: 1, level: 1, decay: 0.006 },
    { ratio: 1.7, level: 0.5, decay: 0.004 },
  ],
  attack: 0.0003,
  secs: 0.03,
});

/**
 * Soft rain, made to loop: a bed of hiss above `hiss` Hz, and drops at
 * random, 176.4 a second on average; on a roof, `taps` a second on its tiles,
 * inside the loop with the rest.
 */
export const rain = (settings: {
  readonly secs: number;
  readonly hiss: number;
  readonly taps?: number;
}): Node => {
  const made = settings.secs + RAIN_LOOP;
  const taps: ReadonlyArray<{ readonly node: Node; readonly db: number }> =
    settings.taps === undefined
      ? []
      : [
          {
            node: {
              _tag: 'Repeat',
              timing: { _tag: 'Poisson', rate: settings.taps, secs: made },
              of: TAP,
            },
            db: -6,
          },
        ];
  return {
    _tag: 'Loop',
    crossfade: RAIN_LOOP,
    of: {
      _tag: 'Layer',
      secs: made,
      of: [
        { node: highpass(settings.hiss, pink(made)), db: db(0.25) },
        {
          node: {
            _tag: 'Repeat',
            timing: { _tag: 'Poisson', rate: DROPS, secs: made },
            of: DROP,
          },
        },
        ...taps,
      ],
    },
  };
};

// Families: the shapes the library's code sounds are built from, each with
// the few settings a sound chooses and the variation its seeds draw. A sound
// layers them (apps/animations/sounds/library.ts); a family's shape lives
// here once, so an edit to it changes the key of every sound built from it.

/** A level `gain` dB from full scale. */
const level = (gain: number): number => dbToGain(gain);

/** `hz` drawn per seed within `spread` semitones either side, evenly in pitch. */
const around = (hz: number, spread: number): Value<number> => ({
  _tag: 'Vary',
  min: hz / exp2(spread / 12),
  max: hz * exp2(spread / 12),
  curve: 'log',
});

/** Its child struck: up over `attack` seconds, then falling evenly in dB, by `depth` dB at `end` seconds. */
const struck = (attack: number, end: number, depth: number, of: Node): Node => ({
  _tag: 'Envelope',
  points: [
    [0, 0],
    [attack, 1],
    [end, level(-depth)],
  ],
  curve: 'exponential',
  of,
});

/**
 * A burst of noise in a band, struck: up over `attack` seconds and down by
 * 80 dB at `decay`, its band between `low` and `high` Hz (a Butterworth
 * highpass and lowpass, 12 dB an octave outside it). Short and bright, it is
 * a click; soft and dark, a puff of air. Each seed draws both edges within
 * two semitones.
 */
export const burst = (settings: {
  readonly color: 'white' | 'pink' | 'brown';
  readonly low: number;
  readonly high: number;
  readonly attack: number;
  readonly decay: number;
}): Node => ({
  _tag: 'Filter',
  type: 'lowpass',
  hz: around(settings.high, 2),
  q: 0.7,
  of: {
    _tag: 'Filter',
    type: 'highpass',
    hz: around(settings.low, 2),
    q: 0.7,
    of: struck(settings.attack, settings.decay, 80, {
      _tag: 'Noise',
      color: settings.color,
      secs: settings.decay,
    }),
  },
});

/**
 * A thump: a sine struck `octaves` above its pitch and falling to it over
 * `drop` seconds, as a drum skin's pitch falls, dying away by 80 dB at
 * `decay`. A highpass an octave under its pitch takes off the rumble its
 * strike spreads below it. Each seed draws both ends of the fall within a
 * semitone.
 */
export const thump = (settings: {
  readonly hz: number;
  readonly octaves: number;
  readonly drop: number;
  readonly decay: number;
}): Node =>
  highpass(
    settings.hz / 2,
    struck(0.001, settings.decay, 80, {
      _tag: 'Osc',
      wave: 'sine',
      phase: 0,
      pitch: {
        _tag: 'Ramp',
        from: around(settings.hz * exp2(settings.octaves), 1),
        to: around(settings.hz, 1),
        secs: settings.drop,
        curve: 'exponential',
      },
      secs: settings.decay,
    }),
  );

/**
 * How a struck material sounds: the modes it rings with (each a ratio to its
 * pitch, a level and a decay's time constant), and its click of contact: a
 * band of noise between two ratios to its pitch, its level in dB over the
 * modes', and when it has fallen by 80 dB.
 */
const MATERIALS = {
  // A hardwood block: a low body mode, two strong modes a little over an
  // octave apart and fainter ones above, damped within a few hundredths of a
  // second, so it knocks rather than rings; its contact a bright click.
  wood: {
    modes: [
      { ratio: 0.6, level: 0.3, decay: 0.015 },
      { ratio: 1, level: 1, decay: 0.012 },
      { ratio: 1.35, level: 0.4, decay: 0.01 },
      { ratio: 2.1, level: 0.7, decay: 0.009 },
      { ratio: 2.6, level: 0.9, decay: 0.008 },
      { ratio: 3.4, level: 0.6, decay: 0.006 },
      { ratio: 5.1, level: 0.25, decay: 0.004 },
    ],
    contact: { color: 'pink', low: 1.2, high: 6, db: 8, decay: 0.03 },
  },
  // A stone slab: dense low modes, ringing a little longer; its contact a
  // dull crack of dark noise, louder than its modes.
  stone: {
    modes: [
      { ratio: 1, level: 0.6, decay: 0.03 },
      { ratio: 1.3, level: 0.5, decay: 0.025 },
      { ratio: 2, level: 0.3, decay: 0.02 },
      { ratio: 2.5, level: 0.6, decay: 0.016 },
      { ratio: 3.2, level: 0.7, decay: 0.012 },
      { ratio: 4.1, level: 0.4, decay: 0.008 },
      { ratio: 5.3, level: 0.2, decay: 0.006 },
    ],
    contact: { color: 'pink', low: 1, high: 2.5, db: 18, decay: 0.2 },
  },
} as const;

/**
 * A knock: `material` struck at `hz`, its modes ringing and dying for up to
 * `secs`, over its click of contact: a burst of noise in a band at and above
 * the pitch. A highpass two octaves under its pitch takes off the rumble its
 * modes' strike spreads below them. Each seed draws the pitch within a
 * semitone.
 */
export const knock = (settings: {
  readonly material: keyof typeof MATERIALS;
  readonly hz: number;
  readonly secs: number;
}): Node => {
  const material = MATERIALS[settings.material];
  return highpass(settings.hz / 4, {
    _tag: 'Layer',
    of: [
      {
        node: {
          _tag: 'Partials',
          pitch: around(settings.hz, 1),
          set: material.modes,
          attack: 0.0005,
          secs: settings.secs,
        },
      },
      {
        node: burst({
          color: material.contact.color,
          low: settings.hz * material.contact.low,
          high: settings.hz * material.contact.high,
          attack: 0.0002,
          decay: material.contact.decay,
        }),
        db: material.contact.db,
      },
    ],
  });
};

/**
 * Things landing one after another, `count` of them: the first at `first`
 * seconds, each next one about `every` seconds after the last (drawn within
 * a third of it) and `fall` dB quieter, the whole `secs` long. Each lands as
 * a knock of `material` at `hz`, a soft thud three octaves below it and a
 * puff of dust between 600 and 1600 Hz, dulled above three times its pitch.
 */
export const scatter = (settings: {
  readonly count: number;
  readonly first: number;
  readonly every: number;
  readonly fall: number;
  readonly material: keyof typeof MATERIALS;
  readonly hz: number;
  readonly secs: number;
}): Node => {
  const landing: Node = lowpass(settings.hz * 3, {
    _tag: 'Layer',
    of: [
      { node: knock({ material: settings.material, hz: settings.hz, secs: 0.3 }) },
      {
        node: thump({ hz: settings.hz / 8, octaves: 0.5, drop: 0.015, decay: 0.2 }),
        db: -14,
      },
      {
        node: burst({ color: 'pink', low: 600, high: 1600, attack: 0.001, decay: 0.08 }),
        db: -10,
      },
    ],
  });
  const at = (k: number): Value<number> => {
    const mean = settings.first + k * settings.every;
    if (k === 0) return mean;
    return { _tag: 'Vary', min: mean - settings.every / 3, max: mean + settings.every / 3 };
  };
  return {
    _tag: 'Layer',
    secs: settings.secs,
    of: [
      { node: landing, at: at(0) },
      ...Array.from({ length: settings.count - 1 }, (_, j) => ({
        node: landing,
        at: at(j + 1),
        db: -settings.fall * (j + 1),
      })),
    ],
  };
};

/**
 * A whoosh: noise above `low` Hz through a band, as something passes close
 * by. Its level rises evenly in dB from −30 dB at `onset` to its loudest at
 * `hit` (−8 dB a fifth of a second before it), then falls 40 dB over `fall`
 * seconds; its band rises to `high` Hz at the hit and falls back. Each seed
 * draws the band's top within two semitones.
 */
export const whoosh = (settings: {
  readonly onset: number;
  readonly hit: number;
  readonly fall: number;
  readonly low: number;
  readonly high: number;
  readonly q: number;
}): Node => {
  const end = settings.hit + settings.fall;
  const near = Math.max(settings.onset, settings.hit - 0.2);
  return {
    _tag: 'Envelope',
    points: [
      [0, 0],
      [settings.onset, level(-30)],
      [near, level(-8)],
      [settings.hit, 1],
      [end, level(-40)],
    ],
    curve: 'exponential',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: {
        _tag: 'Points',
        points: [
          [0, settings.low * 2],
          [settings.hit, around(settings.high, 2)],
          [end, settings.low * 2],
        ],
        curve: 'exponential',
      },
      q: settings.q,
      of: highpass(settings.low, { _tag: 'Noise', color: 'pink', secs: end }),
    },
  };
};

/**
 * A hiss: breath forced out, white noise through a high band at `hz`, rising
 * over `rise` seconds, held to `hold` and fading to silence at `secs`. Each
 * seed draws the band within two semitones.
 */
export const hiss = (settings: {
  readonly hz: number;
  readonly q: number;
  readonly rise: number;
  readonly hold: number;
  readonly secs: number;
}): Node => ({
  _tag: 'Envelope',
  points: [
    [0, 0],
    [settings.rise, 1],
    [settings.hold, 1],
    [settings.secs, 0],
  ],
  curve: 'smooth',
  of: {
    _tag: 'Filter',
    type: 'bandpass',
    hz: around(settings.hz, 2),
    q: settings.q,
    of: { _tag: 'Noise', color: 'white', secs: settings.secs },
  },
});

/** A pop of a sizzle's crackle: a millisecond of bright noise at a level drawn between 0.2 and 1. */
const POP: Node = levelBetween(0.2, 1, {
  _tag: 'Filter',
  type: 'highpass',
  hz: 3000,
  q: 0.7,
  of: { _tag: 'Noise', color: 'white', secs: 0.0015 },
});

/**
 * A sizzle: water on hot metal. A flash of steam (white noise above about
 * 700 Hz) at `flash` seconds, over steam and a low boil (pink noise above
 * 60 Hz, 12 dB under it) that fall evenly by 45 dB to `secs`, crackling at
 * random, `crackle` pops a second. Each seed draws the steam's edge within
 * two semitones.
 */
export const sizzle = (settings: {
  readonly flash: number;
  readonly crackle: number;
  readonly secs: number;
}): Node => {
  const steam = (secs: number): Node => ({
    _tag: 'Filter',
    type: 'highpass',
    hz: around(700, 2),
    q: 0.5,
    of: { _tag: 'Noise', color: 'white', secs },
  });
  return {
    _tag: 'Layer',
    of: [
      { node: struck(0.002, 0.12, 80, steam(0.12)), at: settings.flash },
      {
        node: struck(0.01, settings.secs, 45, {
          _tag: 'Layer',
          of: [
            { node: steam(settings.secs) },
            { node: highpass(60, pink(settings.secs)), db: -12 },
            {
              node: {
                _tag: 'Repeat',
                timing: { _tag: 'Poisson', rate: settings.crackle, secs: settings.secs },
                of: POP,
              },
              db: -6,
            },
          ],
        }),
        db: -4,
      },
    ],
  };
};

/**
 * A steady breeze, made to loop: pink air through a band at `hz` that wanders
 * slowly three semitones either side, its level swaying by a decibel and a
 * half, between a highpass at 90 Hz that keeps rumble out and a lowpass at
 * two and a half times the band that keeps hiss out.
 */
export const breeze = (settings: { readonly secs: number; readonly hz: number }): Node => {
  const made = settings.secs + BED_LOOP;
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: {
      _tag: 'Gain',
      db: { _tag: 'Wobble', around: 0, depth: 1.5, rate: 0.15 },
      of: {
        _tag: 'Filter',
        type: 'bandpass',
        hz: { _tag: 'Wobble', around: settings.hz, depth: 3, rate: 0.1 },
        q: 0.7,
        of: lowpass(settings.hz * 2.5, highpass(90, pink(made))),
      },
    },
  };
};

/** A recipe's sound made by code: its port, with the recipe's own settings. */
export const portOf = (recipe: Recipe): Node => {
  switch (recipe.recipe) {
    case 'room':
      return room(recipe);
    case 'bell':
      return chime(recipe);
    case 'drone':
      return drone(recipe);
    case 'drain':
      return drain(recipe);
    case 'bloom':
      return bloom(recipe);
    case 'notes':
      return notes(recipe);
    case 'wind':
      return wind(recipe);
    case 'rain':
      return rain({ secs: recipe.secs, hiss: 400 });
  }
};
