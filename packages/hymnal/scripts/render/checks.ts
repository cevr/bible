/**
 * What each recording must be before it joins the set, measured on the MP3
 * as a player decodes it. Every check is a reason to fail the hymn, and the
 * record keeps each one's value beside its limit. Pure.
 */

import { momentaryBlocks, type Pcm } from '@bible/film/measure';

export const LIMITS = {
  /** The decoded length is the MIDI's plus the tail within this, in seconds. */
  length: 0.05,
  /** dBTP, FFmpeg's ebur128 with `peak=true`. */
  truePeak: -1,
  /** LU either side of the target, by the film's meter. */
  loudness: 1,
  /** LU the film's meter and ebur128 may differ. */
  meters: 0.1,
  /** No decoded sample's magnitude reaches this. */
  clip: 0.999,
  /** While the MIDI sounds, no run of momentary blocks under `quiet` LUFS lasts longer than this, in seconds. */
  silence: 1,
  quiet: -45,
  /** The first 10 ms window over `onsetDb` dBFS falls within this of the first note-on, in ms. */
  lag: 30,
  onsetDb: -50,
  /** Peak resident memory, bytes: the piano's sampler, any other sampler, the render's own process. */
  memory: { piano: 3.0e9, sampler: 0.5e9, render: 1.0e9 },
} as const;

/** One check: whether it passed, what was measured and what it was held to. */
export interface Check {
  readonly ok: boolean;
  readonly value: number;
  readonly limit: number;
}

/** A span of seconds. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

/** Overlapping or touching spans joined, by start. */
export const merged = (spans: ReadonlyArray<Span>): Span[] => {
  const out: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last !== undefined && span.from <= last.to)
      out[out.length - 1] = { from: last.from, to: Math.max(last.to, span.to) };
    else out.push(span);
  }
  return out;
};

const WINDOW = 0.01;

/**
 * Where the recording first sounds, in seconds: the start of the first 10 ms
 * window whose power, averaged over the channels, is over `db` dBFS.
 */
export const firstSound = (pcm: Pcm, db: number): number | undefined => {
  const size = Math.round(WINDOW * pcm.rate);
  const floor = 10 ** (db / 10);
  for (let start = 0; start + size <= pcm.frames; start += size) {
    let power = 0;
    for (const plane of pcm.channels)
      for (let i = start; i < start + size; i++) power += (plane[i] ?? 0) ** 2;
    if (power / size / pcm.channels.length > floor) return start / pcm.rate;
  }
  return undefined;
};

/** The longest run of momentary blocks under `quiet` LUFS whose middles fall where a note sounds, in seconds. */
export const longestQuiet = (pcm: Pcm, sounding: ReadonlyArray<Span>, quiet: number): number => {
  const spans = merged(sounding);
  const isSounding = (t: number) => spans.some((s) => t >= s.from && t < s.to);
  let longest = 0;
  let run: Span | undefined;
  for (const block of momentaryBlocks(pcm)) {
    const middle = (block.from + block.to) / 2;
    if (block.lufs < quiet && isSounding(middle)) {
      run = { from: run?.from ?? block.from, to: block.to };
      longest = Math.max(longest, run.to - run.from);
    } else run = undefined;
  }
  return longest;
};

/** The largest sample magnitude. */
export const samplePeak = (pcm: Pcm) => {
  let peak = 0;
  for (const plane of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) peak = Math.max(peak, Math.abs(plane[i] ?? 0));
  return peak;
};

/** What the master and the meters measured of one hymn, and what its stems and samplers did. */
export interface Measured {
  readonly seconds: number;
  readonly expectedSeconds: number;
  readonly truePeak: number;
  readonly lufs: number;
  readonly ebur128Lufs: number;
  readonly targetLufs: number;
  readonly peak: number;
  readonly longestQuiet: number;
  readonly lagMs: number;
  /** Each stem with notes: its loudness, its frames, and the frames through its own last note-off (`expectedOf` in `record.ts`). */
  readonly stems: ReadonlyArray<{
    readonly lufs: number;
    readonly frames: number;
    readonly needed: number;
  }>;
  readonly rss: { readonly piano: number; readonly sampler: number; readonly render: number };
}

const check = (ok: boolean, value: number, limit: number): Check => ({ ok, value, limit });

/** Every check of one hymn, by name. */
export const checksOf = (m: Measured) => ({
  length: check(
    Math.abs(m.seconds - m.expectedSeconds) <= LIMITS.length,
    m.seconds - m.expectedSeconds,
    LIMITS.length,
  ),
  truePeak: check(m.truePeak <= LIMITS.truePeak, m.truePeak, LIMITS.truePeak),
  loudness: check(
    Math.abs(m.lufs - m.targetLufs) <= LIMITS.loudness &&
      Math.abs(m.lufs - m.ebur128Lufs) <= LIMITS.meters,
    m.lufs,
    m.targetLufs,
  ),
  clipping: check(m.peak < LIMITS.clip, m.peak, LIMITS.clip),
  silence: check(m.longestQuiet <= LIMITS.silence, m.longestQuiet, LIMITS.silence),
  onsetLag: check(Math.abs(m.lagMs) <= LIMITS.lag, m.lagMs, LIMITS.lag),
  stems: check(
    m.stems.every((s) => Number.isFinite(s.lufs) && s.frames >= s.needed),
    m.stems.filter((s) => !(Number.isFinite(s.lufs) && s.frames >= s.needed)).length,
    0,
  ),
  memory: check(
    m.rss.piano <= LIMITS.memory.piano &&
      m.rss.sampler <= LIMITS.memory.sampler &&
      m.rss.render <= LIMITS.memory.render,
    Math.max(
      m.rss.piano / LIMITS.memory.piano,
      m.rss.sampler / LIMITS.memory.sampler,
      m.rss.render / LIMITS.memory.render,
    ),
    1,
  ),
});

export type Checks = ReturnType<typeof checksOf>;

export const passed = (checks: Checks) => Object.values(checks).every((c) => c.ok);
