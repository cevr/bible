/**
 * Style C, "Warm band", as data: what plays each part, how loud, where, and
 * the room, the sampler and the master around them. The owner picked it by
 * ear from the listening pilot (2026-10-20), so every number here is the
 * pilot's. Any change to it changes every hymn's resume key and is a new set.
 */

/** A part of the hymn (`voices.ts`): S the melody, A and T the inner voices, B the bass. */
export type Part = 'S' | 'A' | 'T' | 'B';

export interface Stem {
  readonly name: string;
  /** The SFZ file, from the instrument cache's root. */
  readonly sfz: string;
  /** Each part the stem plays, at its MIDI velocity (humanised by a seeded ±5). */
  readonly parts: Partial<Record<Part, number>>;
  /** Semitones added to every key. */
  readonly transpose: number;
  /** LU relative to the piano: each stem is levelled to −23 LUFS plus this before the sum. */
  readonly level: number;
  /** −1 left to 1 right. */
  readonly pan: number;
}

export const PIANO_SFZ = 'salamander/Salamander Grand Piano V3.sfz';

export const STYLE = {
  name: 'C',
  title: 'Warm band',
  rate: 44100,
  stems: [
    {
      name: 'piano',
      sfz: PIANO_SFZ,
      parts: { S: 84, A: 64, T: 64, B: 70 },
      transpose: 0,
      level: 0,
      pan: 0,
    },
    {
      name: 'violas',
      sfz: 'vsco/ViolaEnsSusVib.sfz',
      parts: { A: 70 },
      transpose: 0,
      level: -8,
      pan: 0.25,
    },
    {
      name: 'cellos',
      sfz: 'vsco/CelloEnsSusVib.sfz',
      parts: { T: 70 },
      transpose: 0,
      level: -8,
      pan: -0.2,
    },
    {
      name: 'bass',
      sfz: 'vsco/ContrabassSusNV.sfz',
      parts: { B: 60 },
      transpose: -12,
      level: -11,
      pan: 0,
    },
    {
      name: 'violins-melody',
      sfz: 'vsco/ViolinEnsSusVib.sfz',
      parts: { S: 60 },
      transpose: 0,
      level: -10,
      pan: -0.3,
    },
  ] satisfies ReadonlyArray<Stem>,
  /** Velocities move by a whole number drawn from −humanise to +humanise. */
  humanise: 5,
  /** The room: a seeded noise impulse response, RT60 per band (below 250 Hz, to 1 kHz, to 4 kHz, above). */
  reverb: { rt60: [1.3, 1.1, 0.9, 0.6], predelay: 0.01, wet: 0.24, seed: 37 },
  /** Seconds after the MIDI's end: the room's ring, faded over the last `fade`. */
  tail: 2,
  fade: 0.8,
  /** sfizz_render's resampling quality, voices and block size. */
  sfizz: { quality: 3, polyphony: 128, block: 512 },
  /** Each stem's level before its offset, LUFS. */
  stemLufs: -23,
  /** The master: −20 LUFS into the room and compressor, then −16 LUFS limited at −2 dBFS. */
  master: {
    preLufs: -20,
    targetLufs: -16,
    /** How far the MP3 may miss the target before another pass, and how many passes. */
    within: 0.2,
    passes: 3,
    compressor: 'threshold=-24dB:ratio=2:attack=25:release=300:knee=6:makeup=1:detection=rms',
    limitDb: -2,
    limiter: 'attack=5:release=80:level=0:latency=1',
    bitrate: '192k',
  },
} as const;

export type Style = typeof STYLE;
