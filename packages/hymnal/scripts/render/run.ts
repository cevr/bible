/**
 * One hymn from its MIDI file to its checked MP3, and the run around the
 * hymns: the resume key, the machine's guards, the record and the manifest.
 *
 * - **Resume.** A hymn is kept or rendered by `resume.ts`; the render's own
 *   sources (`sourcesOf`) are part of its key.
 * - **Guards.** Before a hymn starts, the run waits while swap use is over
 *   8 GB or the 1-minute load is over 12 (one line when it starts waiting;
 *   the wait is left out of the hymn's times), and stops when the output's
 *   disk has under 3 GB free.
 * - **Memory.** The piano's sampler runs beside the string samplers, one at a
 *   time: at most two children, each under `nice -n 10` and `time -l`. The
 *   mix reads one stem at a time. Each child's peak and the render's own
 *   (sampled every 250 ms) go in the record, and the memory check holds them.
 * - **Files.** The stems, the dry mix and the pre-master go once the hymn is
 *   done; `<n>.mp3` and `<n>.json` are written to `.part` files and renamed,
 *   and a failed hymn also gets `<n>.png`, the film's sheet of it.
 */

import { encodePng, loudness, sheetOf } from '@bible/film/measure';
import { Effect, FileSystem, Path, Schema } from 'effect';
import * as Midi from '../../src/midi.js';
import { creditText, recordingKey } from '../../src/recordings.js';
import { ManifestJson, type RecordingManifest } from '../../src/recording-manifest.js';
import { voices } from '../../src/voices.js';
import { checksOf, firstSound, LIMITS, longestQuiet, passed, samplePeak } from './checks.js';
import { masterHymn } from './master.js';
import { addStem, emptyMix } from './mix.js';
import { RenderFailed, runOk } from './proc.js';
import { hashOf, resumeOf } from './resume.js';
import { sample, ramSfz, sha256Hex } from './sfizz.js';
import { stemMidi, stemNotes } from './stems.js';
import { PIANO_SFZ, type Stem, type Style } from './style.js';
import { readWav, writeWav } from './wav.js';

/** Everything a hymn's render reads besides its MIDI file. */
export interface Setup {
  readonly style: Style;
  readonly set: string;
  readonly cache: string;
  readonly out: string;
  readonly work: string;
  readonly sfizz: { readonly binary: string; readonly sha256: string };
  readonly nodeAv: string;
  readonly configHash: string;
  readonly ir: string;
}

/** The part of a hymn's record the resume and the manifest read. */
const Kept = Schema.Struct({
  hymn: Schema.Int,
  key: Schema.String,
  passed: Schema.Boolean,
  file: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
  md5: Schema.String,
  seconds: Schema.Finite,
  lufs: Schema.Finite,
  truePeak: Schema.Finite,
  lagMs: Schema.Finite,
});
const KeptJson = Schema.fromJsonString(Kept);

/** The render's own sources (its tests aside), by path from the hymnal package: what a change to the code re-renders. */
export const sourcesOf = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pkg = path.resolve(import.meta.dir, '../..');
  const scripts = (yield* fs.readDirectory(import.meta.dir, { recursive: true }))
    .map((f) => path.join('scripts/render', f))
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.DS_Store'));
  const files = [...scripts, 'src/voices.ts', 'src/midi.ts', 'src/score.ts'].sort();
  const out: Array<readonly [string, string]> = [];
  for (const file of files) {
    const full = path.join(pkg, file);
    if ((yield* fs.stat(full)).type === 'File')
      out.push([file, sha256Hex(yield* fs.readFile(full))]);
  }
  return out;
});

/** sysctl's swap in use, in bytes, and the 1-minute load. */
const machine = Effect.gen(function* () {
  const swap = (yield* runOk('sysctl', 'sysctl', ['-n', 'vm.swapusage'])).stdout;
  const load = (yield* runOk('sysctl', 'sysctl', ['-n', 'vm.loadavg'])).stdout;
  const used = /used = ([\d.]+)M/.exec(swap);
  const one = /\{\s*([\d.]+)/.exec(load);
  return {
    swap: Number(used?.[1] ?? 0) * 2 ** 20,
    load: Number(one?.[1] ?? 0),
  };
});

/** Free bytes on the disk that holds `dir`. */
const freeBytes = (dir: string) =>
  Effect.map(runOk('df', 'df', ['-k', dir]), (out) => {
    const row = out.stdout.trim().split('\n').at(-1) ?? '';
    return Number(row.split(/\s+/)[3] ?? 0) * 1024;
  });

export const GUARDS = {
  swap: 8 * 2 ** 30,
  load: 12,
  disk: 3 * 2 ** 30,
  poll: '20 seconds',
} as const;

/** Waits while the machine is over its swap or load ceiling; fails when the disk is nearly full. Answers the seconds waited. */
export const guard = (out: string) =>
  Effect.gen(function* () {
    if ((yield* freeBytes(out)) < GUARDS.disk)
      return yield* RenderFailed.make({
        step: 'disk',
        reason: `under ${GUARDS.disk / 2 ** 30} GB free where ${out} is`,
      });
    const started = performance.now();
    let said = false;
    for (;;) {
      const now = yield* machine;
      if (now.swap <= GUARDS.swap && now.load <= GUARDS.load) break;
      if (!said)
        yield* Effect.sync(() =>
          console.log(
            `  waiting: swap ${(now.swap / 2 ** 30).toFixed(2)} GB (ceiling 8), load ${now.load.toFixed(1)} (ceiling 12)`,
          ),
        );
      said = true;
      yield* Effect.sleep(GUARDS.poll);
    }
    return (performance.now() - started) / 1000;
  });

/** The render's own peak resident memory while `self` runs, sampled every 250 ms. */
const sampledRss = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const peak = { rss: process.memoryUsage().rss };
      const timer = setInterval(() => {
        peak.rss = Math.max(peak.rss, process.memoryUsage().rss);
      }, 250);
      return { peak, timer };
    }),
    ({ peak }) =>
      Effect.map(self, (value) => ({
        value,
        rss: Math.max(peak.rss, process.memoryUsage().rss),
      })),
    ({ timer }) => Effect.sync(() => clearInterval(timer)),
  );

const padded = (hymn: number) => String(hymn).padStart(3, '0');

const md5Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(bytes);
  return hasher.digest('hex');
};

/** The record of `hymn` in `out`, when there is one that reads. */
export const readKept = (out: string, hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(out, `${hymn}.json`);
    if (!(yield* fs.exists(file))) return undefined;
    const text = yield* fs.readFileString(file);
    return yield* Schema.decodeEffect(KeptJson)(text).pipe(Effect.orElseSucceed(() => undefined));
  });

/** What one hymn came to: kept from an earlier run, rendered and passed, or rendered and failed. */
export interface Outcome {
  readonly hymn: number;
  readonly status: 'kept' | 'passed' | 'failed';
  readonly line: string;
}

/** One stem of a hymn: its style entry, its note count, its MIDI and WAV files and its RAM wrapper. */
interface StemJob {
  readonly stem: Stem;
  readonly notes: number;
  readonly mid: string;
  readonly wav: string;
  readonly sfz: string;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** Writes `bytes` to `file` through a `.part` file. */
const writeAtomic = (file: string, bytes: Uint8Array) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(`${file}.part`, bytes);
    yield* fs.rename(`${file}.part`, file);
  });

/** Renders `hymn` into `setup.out`, or keeps it (see the module's doc). */
export const renderHymn = (setup: Setup, hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { style } = setup;
    const midiBytes = yield* fs.readFile(
      path.resolve(import.meta.dir, '../../data/midi', `${padded(hymn)}.mid`),
    );
    const key = hashOf([
      ['config', setup.configHash],
      ['midi', sha256Hex(midiBytes)],
    ]);
    const mp3File = path.join(setup.out, `${hymn}.mp3`);
    const kept = yield* readKept(setup.out, hymn);
    const mp3Sha = (yield* fs.exists(mp3File)) ? sha256Hex(yield* fs.readFile(mp3File)) : undefined;
    if (resumeOf(kept, key, mp3Sha) === 'keep')
      return { hymn, status: 'kept', line: `${hymn} kept` } satisfies Outcome;

    const waited = yield* guard(setup.out);
    const started = performance.now();
    const midi = yield* Midi.parse(midiBytes).pipe(
      Effect.mapError((e) => RenderFailed.make({ step: `midi ${hymn}`, reason: e.reason })),
    );
    const parts = voices(midi);
    const at = Midi.secondsAt(midi);
    const midiSeconds = Midi.secondsOf(midi);
    const work = path.join(setup.work, String(hymn));
    yield* fs.makeDirectory(work, { recursive: true });

    // The stems' MIDI files, then the samplers: the piano beside the strings, one string at a time.
    const stems: StemJob[] = [];
    for (const stem of style.stems) {
      // The pilot's seed, the hymn padded as its file is named: the same velocities the owner heard.
      const seed = `${padded(hymn)}-${style.name}-${stem.name}`;
      const notes = stemNotes(parts, stem, seed, style.humanise);
      const mid = path.join(work, `${stem.name}.mid`);
      yield* fs.writeFile(mid, stemMidi(midi, notes));
      const sfz = yield* ramSfz(path.join(setup.cache, 'instruments'), stem.sfz);
      stems.push({ stem, notes: notes.length, mid, wav: path.join(work, `${stem.name}.wav`), sfz });
    }
    const runStem = (s: StemJob) =>
      Effect.map(sample(setup.sfizz.binary, s.sfz, s.mid, s.wav, style), (r) => ({
        name: s.stem.name,
        ...r,
      }));
    const piano = stems.filter((s) => s.stem.sfz === PIANO_SFZ);
    const strings = stems.filter((s) => s.stem.sfz !== PIANO_SFZ);
    const sampledStart = performance.now();
    const [pianoRuns, stringRuns] = yield* Effect.all(
      [
        Effect.forEach(piano, runStem, { concurrency: 1 }),
        Effect.forEach(strings, runStem, { concurrency: 1 }),
      ],
      { concurrency: 2 },
    );
    const samplerSeconds = (performance.now() - sampledStart) / 1000;

    const mixed = yield* sampledRss(
      Effect.gen(function* () {
        // The mix: one stem read at a time, its float WAV gone once it is in.
        const mixStart = performance.now();
        const total = Math.round((midiSeconds + style.tail) * style.rate);
        const needed = Math.round(midiSeconds * style.rate);
        const mix = emptyMix(style.rate, total);
        const stemRows = [];
        for (const s of stems) {
          const bytes = yield* fs.readFile(s.wav);
          const pcm = yield* Effect.try({
            try: () => readWav(bytes),
            catch: (cause) => RenderFailed.make({ step: `stem ${s.wav}`, reason: String(cause) }),
          });
          const lufs = addStem(mix, pcm, style.stemLufs + s.stem.level, s.stem.pan);
          yield* fs.remove(s.wav);
          stemRows.push({ name: s.stem.name, notes: s.notes, lufs, frames: pcm.frames, needed });
        }
        const dry = path.join(work, 'dry.wav');
        yield* fs.writeFile(dry, writeWav(mix));
        const mixSeconds = (performance.now() - mixStart) / 1000;

        const masterStart = performance.now();
        const mastered = yield* masterHymn({
          dry,
          ir: setup.ir,
          pre: path.join(work, 'pre.wav'),
          out: `${mp3File}.part`,
          seconds: total / style.rate,
          comment: creditText(),
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
      }),
    );
    const { stemRows, mastered, mixSeconds, masterSeconds } = mixed.value;
    const decoded = mastered.pcm;

    // The checks, on the MP3 as a player decodes it.
    const allNotes = [...parts.S, ...parts.A, ...parts.T, ...parts.B];
    const firstNote = Math.min(...allNotes.map((n) => at(n.start)));
    const sound = firstSound(decoded, LIMITS.onsetDb);
    const lagMs = sound === undefined ? 99_999 : Math.round((sound - firstNote) * 1e4) / 10;
    const sounding = allNotes.map((n) => ({ from: at(n.start), to: at(n.end) }));
    const filmLufs = loudness(decoded).integrated;
    const rss = {
      piano: Math.max(0, ...pianoRuns.map((r) => r.rss)),
      sampler: Math.max(0, ...stringRuns.map((r) => r.rss)),
      render: mixed.rss,
    };
    const checks = checksOf({
      seconds: decoded.frames / style.rate,
      expectedSeconds: midiSeconds + style.tail,
      truePeak: mastered.truePeak,
      lufs: filmLufs,
      ebur128Lufs: mastered.lufs,
      targetLufs: style.master.targetLufs,
      peak: samplePeak(decoded),
      longestQuiet: longestQuiet(decoded, sounding, LIMITS.quiet),
      lagMs,
      stems: stemRows.filter((s) => s.notes > 0),
      rss,
    });
    const ok = passed(checks);
    yield* fs.rename(`${mp3File}.part`, mp3File);
    const mp3 = yield* fs.readFile(mp3File);
    if (!ok)
      yield* writeAtomic(path.join(setup.out, `${hymn}.png`), encodePng(sheetOf(decoded, [])));
    const runs = [...pianoRuns, ...stringRuns];
    const record = {
      hymn,
      key,
      passed: ok,
      file: `${hymn}.mp3`,
      bytes: mp3.byteLength,
      sha256: sha256Hex(mp3),
      md5: md5Hex(mp3),
      seconds: Math.round((decoded.frames / style.rate) * 1e6) / 1e6,
      midiSeconds: Math.round(midiSeconds * 1e6) / 1e6,
      lufs: Math.round(filmLufs * 100) / 100,
      ebur128Lufs: mastered.lufs,
      truePeak: Math.round(mastered.truePeak * 100) / 100,
      lagMs,
      passes: mastered.passes,
      checks,
      stems: Object.fromEntries(
        stemRows.map((s) => {
          const r = runs.find((x) => x.name === s.name);
          return [
            s.name,
            {
              notes: s.notes,
              lufs: Number.isFinite(s.lufs) ? Math.round(s.lufs * 100) / 100 : 'silent',
              frames: s.frames,
              rss: r?.rss ?? 0,
              seconds: Math.round((r?.seconds ?? 0) * 100) / 100,
            },
          ];
        }),
      ),
      rss,
      times: {
        sampler: Math.round(samplerSeconds * 100) / 100,
        mix: Math.round(mixSeconds * 100) / 100,
        master: Math.round(masterSeconds * 100) / 100,
        total: Math.round(((performance.now() - started) / 1000) * 100) / 100,
      },
      waitedSeconds: Math.round(waited),
    };
    yield* writeAtomic(
      path.join(setup.out, `${hymn}.json`),
      utf8(`${JSON.stringify(record, null, 2)}\n`),
    );
    const failedNames = Object.entries(checks)
      .filter(([, c]) => !c.ok)
      .map(([name]) => name);
    const line =
      `${hymn} ${ok ? 'ok' : `FAIL ${failedNames.join(',')}`}: ${record.seconds.toFixed(2)}s ` +
      `(midi ${record.midiSeconds.toFixed(2)} + ${style.tail}), ${record.lufs.toFixed(2)} LUFS, ` +
      `${record.truePeak.toFixed(2)} dBTP, lag ${lagMs} ms, ${(record.bytes / 1e6).toFixed(2)} MB, ` +
      `${record.times.total.toFixed(1)}s`;
    return { hymn, status: ok ? 'passed' : 'failed', line } satisfies Outcome;
  });

/** The set's manifest from every record in `setup.out`, written to `manifest.json`. */
export const writeManifest = (setup: Setup) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hymns = [];
    for (const name of (yield* fs.readDirectory(setup.out)).sort()) {
      const match = /^(\d+)\.json$/.exec(name);
      if (match === null) continue;
      const record = yield* readKept(setup.out, Number(match[1]));
      if (record === undefined) continue;
      hymns.push({
        hymn: record.hymn,
        key: recordingKey(record.hymn),
        file: record.file,
        bytes: record.bytes,
        sha256: record.sha256,
        md5: record.md5,
        seconds: record.seconds,
        lufs: record.lufs,
        truePeak: record.truePeak,
        lagMs: record.lagMs,
        passed: record.passed,
      });
    }
    const manifest: RecordingManifest = {
      set: setup.set,
      style: `${setup.style.name} ${setup.style.title}`,
      platform: `${process.platform}-${process.arch}`,
      configHash: setup.configHash,
      tools: {
        sfizz: { version: '1.2.3', sha256: setup.sfizz.sha256 },
        nodeAv: { version: setup.nodeAv },
      },
      hymns: hymns.sort((a, b) => a.hymn - b.hymn),
    };
    const text = yield* Schema.encodeEffect(ManifestJson)(manifest).pipe(Effect.orDie);
    yield* writeAtomic(
      path.join(setup.out, 'manifest.json'),
      utf8(`${JSON.stringify(JSON.parse(text), null, 2)}\n`),
    );
    return manifest;
  });

/** The room's impulse response, the float WAV beside the render's sources (`STYLE.reverb.ir`). */
export const roomOf = (style: Style) => `${import.meta.dir}/${style.reverb.ir}`;
