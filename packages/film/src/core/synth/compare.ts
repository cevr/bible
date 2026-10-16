// A sound beside another, in numbers an agent reads when it cannot listen
// (`film sfx compare`): each render's profile (its loudness, timing,
// brightness and band balance), each side's median over its renders, and how
// far one side's median stands from the other's. The bands are earshot's
// (tone.py): the 28 one-third octaves from 31.5 Hz to 16 kHz, each as its
// share of the sound's power, so a quieter render keeps its balance. The
// share below 30 Hz stands apart: rumble spends headroom that the loudness
// the mix levels by never hears (the app's sounds/PROMPTING.md). Numbers, no
// verdict: a distance is a hint for the ear, never a target to make small.
// Pure.

import { Array as Arr } from 'effect';
import type { Pcm } from '../audio.ts';
import { describeSound, powerSpectrum } from './analyse.ts';
import { loudness } from './loudness.ts';

/** The FFT the bands are read from: 8192 frames, 5.4 Hz a bin at 44.1 kHz, so the lowest band holds a bin. */
const BAND_FFT = 8192;

/** The bands' nominal names (IEC 61260), low to high. */
const NOMINAL = [
  '31.5 Hz',
  '40 Hz',
  '50 Hz',
  '63 Hz',
  '80 Hz',
  '100 Hz',
  '125 Hz',
  '160 Hz',
  '200 Hz',
  '250 Hz',
  '315 Hz',
  '400 Hz',
  '500 Hz',
  '630 Hz',
  '800 Hz',
  '1 kHz',
  '1.25 kHz',
  '1.6 kHz',
  '2 kHz',
  '2.5 kHz',
  '3.15 kHz',
  '4 kHz',
  '5 kHz',
  '6.3 kHz',
  '8 kHz',
  '10 kHz',
  '12.5 kHz',
  '16 kHz',
] as const;

/** Each band's name and exact centre: 1000·10^(k/10) Hz for k from −15 to 12, the base-ten third octaves. */
const BANDS = NOMINAL.map((name, i) => ({ name, hz: 1000 * 10 ** ((i - 15) / 10) }));

/** A band's edges, a twentieth of a decade either side of its centre, so the bands tile. */
const EDGE = 10 ** (1 / 20);

/** Below this, rumble. */
const RUMBLE_HZ = 30;

/** How far below a side's loudest band a band still counts; a quieter one is read at this floor. */
const COUNTED_DB = 40;

/** The floor of a silent render's bands, which have no loudest to be read against. */
const SILENT_SHARE = 1e-12;

/** Counted bands this far apart are named. */
const APART_DB = 6;

/** What one render is like: seconds, LUFS, dBFS, Hz, and shares from 0 to 1. */
export interface Profile {
  readonly secs: number;
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
  readonly onset: number;
  readonly hit: number;
  /** From the hit to the last 10 ms within 40 dB of the loudest: how long it rings (earshot's t40). */
  readonly tail: number;
  readonly centroid: number;
  readonly flatness: number;
  /** Each band's share of the power, low to high. */
  readonly bands: ReadonlyArray<number>;
  /** The share of the power below 30 Hz. */
  readonly rumble: number;
}

/** `pcm`'s profile, its bands read over every channel's power. */
export const profileOf = (pcm: Pcm): Profile => {
  const described = describeSound(pcm);
  const loud = loudness(pcm);
  const power = new Float64Array(BAND_FFT / 2);
  for (const plane of pcm.channels)
    powerSpectrum(plane, BAND_FFT).forEach((p, k) => {
      power[k] = (power[k] ?? 0) + p;
    });
  const binHz = pcm.rate / BAND_FFT;
  /** The power from `low` up to `high` Hz; the DC bin is no sound. */
  const between = (low: number, high: number): number => {
    let sum = 0;
    for (let k = Math.max(1, Math.ceil(low / binHz)); k < power.length && k * binHz < high; k++)
      sum += power[k] ?? 0;
    return sum;
  };
  const total = between(0, Number.POSITIVE_INFINITY);
  const share = (p: number) => (total > 0 ? p / total : 0);
  return {
    secs: described.secs,
    integrated: loud.integrated,
    momentaryMax: loud.momentaryMax,
    peak: loud.peak,
    onset: described.onset,
    hit: described.hit,
    tail: described.end - described.hit,
    centroid: described.centroid,
    flatness: described.flatness,
    bands: BANDS.map(({ hz }) => share(between(hz / EDGE, hz * EDGE))),
    rumble: share(between(0, RUMBLE_HZ)),
  };
};

/** The middle of `values`: the mean of the middle two for an even count. */
const median = (values: Arr.NonEmptyReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** A side's renders as one: each number the median of theirs, each band's share its own median. */
export const medianProfile = (profiles: Arr.NonEmptyReadonlyArray<Profile>): Profile => {
  const of = (read: (p: Profile) => number) => median(Arr.map(profiles, read));
  return {
    secs: of((p) => p.secs),
    integrated: of((p) => p.integrated),
    momentaryMax: of((p) => p.momentaryMax),
    peak: of((p) => p.peak),
    onset: of((p) => p.onset),
    hit: of((p) => p.hit),
    tail: of((p) => p.tail),
    centroid: of((p) => p.centroid),
    flatness: of((p) => p.flatness),
    bands: BANDS.map((_, k) => of((p) => p.bands[k] ?? 0)),
    rumble: of((p) => p.rumble),
  };
};

/** One band as two sides hear it: each side's share in dB, and how far it moved from the first to the second. */
interface BandRow {
  readonly band: string;
  readonly from: number;
  readonly to: number;
  readonly moved: number;
}

/** How far one side's median stands from another's, each figure the second's less the first's. */
interface Distance {
  /** The bands within 40 dB of either side's loudest, low to high: the ones a balance is read over. */
  readonly bands: ReadonlyArray<BandRow>;
  /** The RMS of the counted bands' moves, in dB (earshot's tone_db). */
  readonly balance: number;
  /** The counted bands that moved more than 6 dB. */
  readonly apart: ReadonlyArray<BandRow>;
  /** How far the hit moved, in seconds. */
  readonly hit: number;
}

/** Each band's share in dB, read at the floor 40 dB below the loudest when quieter, and whether it is above that floor. */
const levelsOf = (bands: ReadonlyArray<number>) => {
  const floor = Math.max(SILENT_SHARE, Math.max(...bands) * 10 ** (-COUNTED_DB / 10));
  return bands.map((share) => ({
    db: 10 * Math.log10(Math.max(share, floor)),
    counts: share >= floor,
  }));
};

/** How far `to` stands from `from`: the bands either side hears, their balance, and the hit's move. */
export const distance = (from: Profile, to: Profile): Distance => {
  const a = levelsOf(from.bands);
  const b = levelsOf(to.bands);
  const bands = BANDS.flatMap(({ name }, k): ReadonlyArray<BandRow> => {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined || !(x.counts || y.counts)) return [];
    return [{ band: name, from: x.db, to: y.db, moved: y.db - x.db }];
  });
  const squares = bands.reduce((sum, row) => sum + row.moved * row.moved, 0);
  return {
    bands,
    balance: bands.length > 0 ? Math.sqrt(squares / bands.length) : 0,
    apart: bands.filter((row) => Math.abs(row.moved) > APART_DB),
    hit: to.hit - from.hit,
  };
};
