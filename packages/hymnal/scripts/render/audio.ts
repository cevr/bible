/**
 * One hymn's sound, from its parsed MIDI file to its MP3: the stems' MIDI
 * files, the samplers, the dry mix and the master. Every module that shapes
 * a recording's bytes is reached from here, and the resume key hashes those
 * (`AUDIO_SOURCES` in `run.ts`, held to this module's imports by
 * `sources.test.ts`), so a change to the checks, the record or the CLI
 * renders nothing again.
 *
 * - **Samplers.** The piano's sampler runs beside the string samplers, one
 *   at a time: at most two children, each under `nice -n 10` and `time -l`.
 * - **Memory.** The mix reads one stem at a time, and the render collects
 *   its garbage after each stem and before the master, so the process holds
 *   one stem beside the sum: what is left for the collector to find later
 *   is still resident, and the memory check reads the process's resident
 *   size.
 * - **Files.** Each stem's float WAV goes once it is in the mix, and the dry
 *   mix and the pre-master once the master is written.
 */

import { Effect, FileSystem, Path } from 'effect';
import * as Midi from '../../src/midi.js';
import { voices } from '../../src/voices.js';
import { masterHymn } from './master.js';
import { addStem, emptyMix } from './mix.js';
import { RenderFailed } from './proc.js';
import { planOf } from './plan.js';
import { ramSfz, sample } from './sfizz.js';
import { stemMidi } from './stems.js';
import { PIANO_SFZ, type Stem, type Style } from './style.js';
import { readWav, writeWav } from './wav.js';

/** What the sound of a hymn reads besides its MIDI file. */
export interface AudioSetup {
  readonly style: Style;
  /** The instrument cache's root. */
  readonly instruments: string;
  /** The patched `sfizz_render`. */
  readonly sampler: string;
  /** The room's impulse response. */
  readonly ir: string;
  /** The MP3's one comment: the credits. */
  readonly comment: string;
}

/** One stem of a hymn: its style entry, its note count, its MIDI and WAV files and its RAM wrapper. */
export interface StemJob {
  readonly stem: Stem;
  readonly notes: number;
  readonly mid: string;
  readonly wav: string;
  readonly sfz: string;
}

/** A hymn's MIDI file, parsed. */
export const readMidi = (bytes: Uint8Array, hymn: number) =>
  Midi.parse(bytes).pipe(
    Effect.mapError((e) => RenderFailed.make({ step: `midi ${hymn}`, reason: e.reason })),
  );

/** Each stem's MIDI file and RAM wrapper, in `work`. */
export const stemJobs = (setup: AudioSetup, hymn: number, midi: Midi.Midi, work: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(work, { recursive: true });
    const jobs: StemJob[] = [];
    for (const { stem, notes } of planOf(voices(midi), setup.style, hymn)) {
      const mid = path.join(work, `${stem.name}.mid`);
      yield* fs.writeFile(mid, stemMidi(midi, notes));
      const sfz = yield* ramSfz(setup.instruments, stem.sfz);
      jobs.push({ stem, notes: notes.length, mid, wav: path.join(work, `${stem.name}.wav`), sfz });
    }
    return jobs;
  });

/** The samplers, the piano beside the strings and one string at a time: each run's peak memory and seconds, by kind. */
export const sampleStems = (setup: AudioSetup, jobs: ReadonlyArray<StemJob>) =>
  Effect.gen(function* () {
    const runStem = (s: StemJob) =>
      Effect.map(sample(setup.sampler, s.sfz, s.mid, s.wav, setup.style), (r) => ({
        name: s.stem.name,
        ...r,
      }));
    const [piano, strings] = yield* Effect.all(
      [
        Effect.forEach(
          jobs.filter((s) => s.stem.sfz === PIANO_SFZ),
          runStem,
          { concurrency: 1 },
        ),
        Effect.forEach(
          jobs.filter((s) => s.stem.sfz !== PIANO_SFZ),
          runStem,
          { concurrency: 1 },
        ),
      ],
      { concurrency: 2 },
    );
    return { piano, strings };
  });

/** Collects the process's garbage now (see the module's doc). */
const collect = Effect.sync(() => Bun.gc(true));

/** One stem's float WAV levelled and panned into `mix`, the WAV gone: its notes, loudness and frames. */
const mixIn = (mix: ReturnType<typeof emptyMix>, style: Style, s: StemJob) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(s.wav);
    const pcm = yield* Effect.try({
      try: () => readWav(bytes),
      catch: (cause) => RenderFailed.make({ step: `stem ${s.wav}`, reason: String(cause) }),
    });
    const lufs = addStem(mix, pcm, style.stemLufs + s.stem.level, s.stem.pan);
    yield* fs.remove(s.wav);
    return { name: s.stem.name, notes: s.notes, lufs, frames: pcm.frames };
  });

/** The dry mix of the stems at the hymn's length plus the tail, written to `dry`: each stem's row. */
const mixDry = (style: Style, jobs: ReadonlyArray<StemJob>, frames: number, dry: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const mix = emptyMix(style.rate, frames);
    const rows = [];
    for (const s of jobs) {
      rows.push(yield* mixIn(mix, style, s));
      yield* collect;
    }
    yield* fs.writeFile(dry, writeWav(mix));
    return rows;
  });

/** The dry mix of the sampled stems at the hymn's length plus the tail, then its master into `mp3`: each stem's row, the master's measure, and the seconds each took. */
export const mixAndMaster = (
  setup: AudioSetup,
  jobs: ReadonlyArray<StemJob>,
  midi: Midi.Midi,
  work: string,
  mp3: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { style } = setup;
    const mixStart = performance.now();
    const total = Math.round((Midi.secondsOf(midi) + style.tail) * style.rate);
    const dry = path.join(work, 'dry.wav');
    const stemRows = yield* mixDry(style, jobs, total, dry);
    yield* collect;
    const mixSeconds = (performance.now() - mixStart) / 1000;

    const masterStart = performance.now();
    const mastered = yield* masterHymn({
      dry,
      ir: setup.ir,
      pre: path.join(work, 'pre.wav'),
      out: mp3,
      seconds: total / style.rate,
      comment: setup.comment,
      style,
    });
    yield* fs.remove(dry);
    yield* fs.remove(path.join(work, 'pre.wav'));
    return {
      stemRows,
      mastered,
      mixSeconds,
      masterSeconds: (performance.now() - masterStart) / 1000,
    };
  });
