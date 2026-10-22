/**
 * A hymn's record, `<n>.json` beside its MP3, as the resume, the checks and
 * the manifest read it back. The record keeps every measurement a check
 * reads, so a change to the checks checks a hymn again from its record and
 * its MIDI file, with no render: only a check that measured the run (the
 * memory) or the stems themselves, which are gone once a hymn is done, would
 * need one. Pure.
 */

import { Schema } from 'effect';
import * as Midi from '../../src/midi.js';
import { voices } from '../../src/voices.js';
import type { Measured } from './checks.js';
import { planOf } from './plan.js';
import type { Style } from './style.js';

const Check = Schema.Struct({ ok: Schema.Boolean, value: Schema.Finite, limit: Schema.Finite });

/** One stem's row: its notes, its own loudness (`silent` when it has none) and its WAV's frames. */
const StemRow = Schema.Struct({
  notes: Schema.Int,
  lufs: Schema.Union([Schema.Finite, Schema.Literal('silent')]),
  frames: Schema.Int,
});

/** The fields of `<n>.json` the run reads back; the rest (times, waits, passes) it only writes. */
export const HymnRecord = Schema.Struct({
  hymn: Schema.Int,
  /** The resume key the MP3 was rendered under (`resume.ts`). */
  key: Schema.String,
  passed: Schema.Boolean,
  file: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
  md5: Schema.String,
  seconds: Schema.Finite,
  lufs: Schema.Finite,
  ebur128Lufs: Schema.Finite,
  truePeak: Schema.Finite,
  lagMs: Schema.Finite,
  checks: Schema.Struct({
    length: Check,
    truePeak: Check,
    loudness: Check,
    clipping: Check,
    silence: Check,
    onsetLag: Check,
    stems: Check,
    memory: Check,
  }),
  stems: Schema.Record(Schema.String, StemRow),
  rss: Schema.Struct({ piano: Schema.Finite, sampler: Schema.Finite, render: Schema.Finite }),
});
export type HymnRecord = typeof HymnRecord.Type;

/** A record's file text, by the fields the run reads back. */
export const HymnRecordJson = Schema.fromJsonString(HymnRecord);

/** A record's file text as a whole object: what a new verdict is written back into, every field kept. */
export const RecordObjectJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

/** What a hymn's MIDI file asks of its recording: its seconds with the tail, and each stem's frames through its last note-off. */
export interface Expected {
  readonly seconds: number;
  readonly stems: Readonly<Record<string, number>>;
}

/**
 * The recording's seconds, and the frames each stem with notes must hold:
 * through its own last note-off, by the hymn's tempo map. The sampler plays
 * a stem from its MIDI file, which ends at that note-off, and renders on
 * until the release has died away, so a stem whose parts end before the
 * hymn's last event is shorter than the hymn and still whole; the mix pads
 * it with silence to the hymn's length, which the length check holds.
 */
export const expectedOf = (
  midi: Midi.Midi,
  style: Pick<Style, 'name' | 'stems' | 'humanise' | 'rate' | 'tail'>,
  hymn: number,
): Expected => {
  const at = Midi.secondsAt(midi);
  const stems: Record<string, number> = {};
  for (const { stem, notes } of planOf(voices(midi), style, hymn)) {
    if (notes.length === 0) continue;
    // The stem's MIDI file holds each note for at least a tick (`stemMidi`).
    const lastOff = Math.max(...notes.map((n) => Math.max(n.end, n.start + 1)));
    stems[stem.name] = Math.round(at(lastOff) * style.rate);
  }
  return { seconds: Midi.secondsOf(midi) + style.tail, stems };
};

/**
 * The measurements a record keeps, as the checks read them: each check's
 * value where it is the measurement itself (true peak, the film's loudness,
 * the sample peak, the longest quiet), the rest from their own fields, and
 * what the MIDI file asks from `expected`.
 */
export const measuredOf = (
  record: HymnRecord,
  expected: Expected,
  targetLufs: number,
): Measured => ({
  seconds: record.seconds,
  expectedSeconds: expected.seconds,
  truePeak: record.checks.truePeak.value,
  lufs: record.checks.loudness.value,
  ebur128Lufs: record.ebur128Lufs,
  targetLufs,
  peak: record.checks.clipping.value,
  longestQuiet: record.checks.silence.value,
  lagMs: record.lagMs,
  stems: Object.entries(record.stems)
    .filter(([, s]) => s.notes > 0)
    .map(([name, s]) => ({
      lufs: s.lufs === 'silent' ? Number.NEGATIVE_INFINITY : s.lufs,
      frames: s.frames,
      needed: expected.stems[name] ?? Number.POSITIVE_INFINITY,
    })),
  rss: record.rss,
});

const verdicts = (checks: Readonly<Record<string, { readonly ok: boolean }>>) =>
  Object.entries(checks)
    .map(([name, check]) => `${name} ${check.ok}`)
    .sort()
    .join(',');

/** Whether two sets of checks pass and fail alike, check by check. */
export const sameVerdicts = (
  a: Readonly<Record<string, { readonly ok: boolean }>>,
  b: Readonly<Record<string, { readonly ok: boolean }>>,
) => verdicts(a) === verdicts(b);
