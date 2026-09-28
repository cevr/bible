// A person's takes: recordings of the script made into takes the film uses as
// it uses a staging take. Each recording is loaded (any format ffmpeg reads),
// trimmed and levelled as the staging takes are (`prepareTake`), encoded to a
// 24-bit FLAC master (the owner's voice is the final voiceover, so nothing
// after the recorder is lossy), transcribed through the same speech-to-text
// narrate uses, and timed by what was heard, lined up with the script's words.
// A take that says something else fails as TakeMismatch unless accepted, as
// narrate's do.
//
// Every recording lands first as an attempt, under `narration/attempts/<beat>/`
// (git-ignored): the recording itself, untouched (`<beat>.<hash>.orig.<ext>`),
// its prepared FLAC, and in `attempts.json` what was heard and when. Keeping
// one copies its FLAC beside the other takes and rewrites `timings.json` whole
// to name it, source `recorded`. The take it replaces is removed from
// `narration/` (its attempt stays). An earlier attempt can be kept again at
// any time. Staging never replaces a recorded take (see narrator.ts).

import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type BeatSpan, cutPcm, cutsAround, placeBeats, timeScript } from '../core/align.ts';
import type { BeatUnplaced, UnknownVoice } from '../core/errors.ts';
import type { Pcm } from '../core/audio.ts';
import { MIX_RATE } from '../core/mix.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import { lineError } from '../core/spoken.ts';
import { prepareTake } from '../core/recording.ts';
import { type Timings, VoiceTiming } from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { ElevenLabs, heardWords } from './elevenlabs.ts';
import {
  type ElevenLabsFailed,
  type MediaFailed,
  RecordingInvalid,
  type SttUntimed,
  TakeMismatch,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { type Beat, MAX_WORD_ERROR, beatsOf, contentHash, takeFile } from './narrator.ts';

/** The files a recording may be: what the owner's recorder saves. */
export const RECORDING_EXTENSIONS = ['.wav', '.m4a', '.mp3', '.aif', '.aiff', '.flac'] as const;

/** The recordings that lose nothing: a take made from any other carries its codec's loss. */
export const LOSSLESS_EXTENSIONS = ['.wav', '.aif', '.aiff', '.flac'] as const;

/** One recording of a beat, kept or not. */
export const Attempt = Schema.Struct({
  beat: Schema.String,
  /** The take's file name (a FLAC master), in `narration/attempts/<beat>/` and, once kept, `narration/`. */
  file: Schema.String,
  /**
   * The recording as it came, untouched, relative to `narration/attempts/`:
   * `<beat>/<beat>.<hash>.orig.<ext>`; for one reading of the whole script,
   * that reading (`whole/whole.<hash>.orig.<ext>`), with `cut` the seconds of
   * it this beat was cut from.
   */
  original: Schema.optionalKey(Schema.String),
  cut: Schema.optionalKey(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  /** The take as the timings would hold it, `source: 'recorded'`. */
  take: VoiceTiming,
  /** What the transcriber heard. */
  heard: Schema.String,
  /** Word error against the script when it was recorded, 0 to 1. */
  wer: Schema.Finite,
  /** When it was recorded, in epoch milliseconds. */
  at: Schema.Finite,
});
export type Attempt = typeof Attempt.Type;

/** `narration/attempts/<beat>/attempts.json`: a beat's attempts, oldest first. */
const Attempts = Schema.Struct({ attempts: Schema.Array(Attempt) });
type Attempts = typeof Attempts.Type;
const AttemptsJson = Schema.fromJsonString(Attempts, { space: 2 });

export interface ImportOptions {
  /** Import just these beats. One file with no beat's name imports as the one beat named here. */
  readonly only: Option.Option<ReadonlySet<string>>;
  /** The beats that may keep a take whose transcript does not match its line (`--accept-mismatch`). */
  readonly acceptMismatch: ReadonlySet<string>;
  /** The file is one recording of the whole script, to be cut into its beats. */
  readonly whole: boolean;
}

/** What keeping one beat's take allows. */
export interface BeatOptions {
  /** Keep it even when its transcript does not match its line ("accept anyway"). */
  readonly acceptMismatch: boolean;
}

/** One beat's part of an import's options. */
const forBeat = (options: ImportOptions, id: string): BeatOptions => ({
  acceptMismatch: options.acceptMismatch.has(id),
});

export type TakesError =
  | RecordingInvalid
  | TakeMismatch
  | BeatUnplaced
  | UnknownVoice
  | ElevenLabsFailed
  | SttUntimed
  | MediaFailed
  | StoreError
  | PlatformError;

/** Whether a file name is a recording's. */
export const isRecording = (name: string): boolean =>
  RECORDING_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** A recording's beat: its file name without the extension. */
const beatNamed = (file: string): string => {
  const name = file.slice(file.lastIndexOf('/') + 1);
  return name.slice(0, Math.max(0, name.lastIndexOf('.')));
};

/** The beats with lines, by id. */
const spokenBeats = (beats: ReadonlyArray<Beat>) =>
  new Map(beats.filter((b) => b.text.length > 0).map((b) => [b.id, b]));

/** The one beat named by `--only`, when it names exactly one. */
const onlyOne = (only: Option.Option<ReadonlySet<string>>): Option.Option<string> =>
  Option.flatMap(
    Option.filter(only, (ids) => ids.size === 1),
    (ids) => Arr.head([...ids]),
  );

/** Whether `--only` lets this beat through. */
const allowed = (only: Option.Option<ReadonlySet<string>>, id: string): boolean =>
  Option.match(only, { onNone: () => true, onSome: (ids) => ids.has(id) });

/** Put a person's take into the timings; every other take stays as it was. */
const withRecorded =
  (film: LoadedFilm, id: string, take: VoiceTiming) =>
  (timings: Timings): Timings => {
    // A film with no takes yet records under its staging voice, as narrate would.
    const scenes = { ...timings.scenes, [id]: take };
    if (timings.voice.length === 0) return { voice: voiceKey(film.voice), scenes };
    return { voice: timings.voice, scenes };
  };

/** Where an attempt's audio came from: the file named in messages, its kept original, and the stretch cut from it. */
interface Source {
  readonly file: string;
  readonly original: string;
  readonly cut: Option.Option<{ readonly from: number; readonly to: number }>;
}

/** A take that was kept. */
export interface Imported {
  readonly id: string;
  readonly take: VoiceTiming;
  readonly heard: string;
  readonly wer: number;
}

export interface TakesService {
  /** Import the recordings at `path`: a folder of `<beat>.<ext>`, one file, or with `whole`, one reading of the script. */
  readonly importPath: (
    film: LoadedFilm,
    path: string,
    options: ImportOptions,
  ) => Effect.Effect<ReadonlyArray<Imported>, TakesError>;
  /** Import one recording as the take of `beat`. */
  readonly importBeat: (
    film: LoadedFilm,
    beat: string,
    file: string,
    options: BeatOptions,
  ) => Effect.Effect<Imported, TakesError>;
  /** A beat's attempts, newest first. */
  readonly attempts: (
    film: LoadedFilm,
    beat: string,
  ) => Effect.Effect<ReadonlyArray<Attempt>, StoreError>;
  /** Where an attempt's audio is on disk, when `file` is one of the beat's attempts. */
  readonly attemptFile: (
    film: LoadedFilm,
    beat: string,
    file: string,
  ) => Effect.Effect<Option.Option<string>, StoreError>;
  /** Keep an earlier attempt as the beat's take. */
  readonly keepAttempt: (
    film: LoadedFilm,
    beat: string,
    file: string,
    options: BeatOptions,
  ) => Effect.Effect<Imported, TakesError>;
}

export class Takes extends Context.Service<Takes, TakesService>()('@bible/film/tools/Takes') {
  static readonly layer = Layer.effect(
    Takes,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const elevenLabs = yield* ElevenLabs;
      const media = yield* Media;

      const attemptsDir = (film: LoadedFilm, beat: string) =>
        path.join(film.paths.narration, 'attempts', beat);
      const ledger = (film: LoadedFilm, beat: string): Manifest<Attempts> => ({
        file: path.join(attemptsDir(film, beat), 'attempts.json'),
        codec: AttemptsJson,
        empty: { attempts: [] },
      });

      const beatsById = (film: LoadedFilm) =>
        Effect.map(Effect.fromResult(beatsOf(film)), spokenBeats);

      const beatFor = (film: LoadedFilm, id: string, file: string) =>
        Effect.flatMap(beatsById(film), (beats) =>
          Option.match(Option.fromNullishOr(beats.get(id)), {
            onSome: Effect.succeed,
            onNone: () =>
              Effect.fail(
                RecordingInvalid.make({
                  file,
                  reason: `the film has no beat "${id}" with a line; its beats are ${[...beats.keys()].join(', ')}`,
                }),
              ),
          }),
        );

      /**
       * The recording at `file` copied, untouched, into `narration/attempts/<dir>/`
       * as `<stem>.<hash>.orig.<ext>`; its path relative to `attempts/`.
       */
      const keepOriginal = Effect.fn('Takes.keepOriginal')(function* (
        film: LoadedFilm,
        dir: string,
        file: string,
      ) {
        const bytes = yield* fs.readFile(file);
        const name = `${dir}.${contentHash(bytes)}.orig${path.extname(file).toLowerCase()}`;
        yield* store.writeFile(path.join(attemptsDir(film, dir), name), bytes);
        if (!LOSSLESS_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext)))
          yield* Effect.logWarning(
            `takes.lossy file=${file} (the master is lossless from here, but this recording already lost what its codec drops; record WAV or FLAC for the final voice)`,
          );
        return `${dir}/${name}`;
      });

      /** A recording, already loaded, made into an attempt at `beat`'s take. */
      const attempt = Effect.fn('Takes.attempt')(function* (
        film: LoadedFilm,
        beat: Beat,
        source: Source,
        recording: Pcm,
      ) {
        const prepared = yield* Effect.fromOption(prepareTake(recording)).pipe(
          Effect.mapError(() =>
            RecordingInvalid.make({
              file: source.file,
              reason: 'nothing in it is louder than the room; check the input level',
            }),
          ),
        );
        const audio = yield* media.encodeFlac(prepared);
        const file = takeFile(beat.id, audio, '.flac');
        const at = path.join(attemptsDir(film, beat.id), file);
        yield* store.writeFile(at, audio);
        const reply = yield* elevenLabs.stt(at);
        const heard = yield* Effect.fromResult(heardWords(reply, source.file));
        const duration = yield* media.duration(at);
        const wer = lineError(beat.text, reply.text, film.heardAs);
        const made: Attempt = {
          beat: beat.id,
          file,
          original: source.original,
          ...Option.match(source.cut, { onNone: () => ({}), onSome: (cut) => ({ cut }) }),
          take: {
            hash: hashText(beat.script),
            file,
            duration,
            words: timeScript(beat.text, heard, duration),
            source: 'recorded',
          },
          heard: reply.text,
          wer,
          at: yield* Clock.currentTimeMillis,
        };
        yield* store.update(ledger(film, beat.id), (kept) => ({
          attempts: [...kept.attempts.filter((a) => a.file !== file), made],
        }));
        yield* Effect.log(
          `takes.attempt id=${beat.id} file=${file} secs=${duration.toFixed(2)} wer=${(wer * 100).toFixed(1)}%`,
        );
        return made;
      });

      /** Make an attempt the beat's take: beside the others, named by the timings. */
      const keep = Effect.fn('Takes.keep')(function* (
        film: LoadedFilm,
        beat: Beat,
        made: Attempt,
        options: BeatOptions,
      ) {
        // Checked now, as the take check reads today: an attempt heard before
        // a `heardAs` name or a better reading of numbers is judged by them.
        const wer = lineError(beat.text, made.heard, film.heardAs);
        if (wer > MAX_WORD_ERROR) {
          const mismatch = TakeMismatch.make({
            id: beat.id,
            script: beat.text,
            heard: made.heard,
            wer,
          });
          if (!options.acceptMismatch) return yield* mismatch;
          yield* Effect.logWarning(`takes.mismatch accepted=true ${mismatch.message}`);
        }
        const bytes = yield* fs.readFile(path.join(attemptsDir(film, beat.id), made.file));
        yield* store.writeFile(path.join(film.paths.narration, made.file), bytes);
        const before = yield* store.read(film.paths.timings);
        // The commit: timings.json names the person's take.
        const after = yield* store.update(
          film.paths.timings,
          withRecorded(film, beat.id, made.take),
        );
        // The take it replaced, unless another beat still names it.
        const named = new Set(Object.values(after.scenes).map((t) => t.file));
        const replaced = Option.filter(
          Option.fromNullishOr(before.scenes[beat.id]),
          (old) => !named.has(old.file),
        );
        if (Option.isSome(replaced)) {
          const old = path.join(film.paths.narration, replaced.value.file);
          if (yield* fs.exists(old)) yield* fs.remove(old);
        }
        yield* Effect.log(`takes.kept id=${beat.id} file=${made.file} source=recorded`);
        return {
          id: beat.id,
          take: made.take,
          heard: made.heard,
          wer,
        } satisfies Imported;
      });

      const importOne = (film: LoadedFilm, beat: Beat, file: string, options: BeatOptions) =>
        Effect.gen(function* () {
          const recording = yield* media.load(file, MIX_RATE);
          const original = yield* keepOriginal(film, beat.id, file);
          const made = yield* attempt(
            film,
            beat,
            { file, original, cut: Option.none() },
            recording,
          );
          return yield* keep(film, beat, made, options);
        });

      const importBeat = Effect.fn('Takes.importBeat')(function* (
        film: LoadedFilm,
        id: string,
        file: string,
        options: BeatOptions,
      ) {
        return yield* importOne(film, yield* beatFor(film, id, file), file, options);
      });

      /** The recordings in a folder, each with its beat, in film order. */
      const folder = Effect.fn('Takes.folder')(function* (
        film: LoadedFilm,
        dir: string,
        options: ImportOptions,
      ) {
        const beats = yield* beatsById(film);
        const files = (yield* fs.readDirectory(dir))
          .filter(isRecording)
          .map((name) => path.join(dir, name));
        const unknown = Arr.head(files.filter((f) => !beats.has(beatNamed(f))));
        if (Option.isSome(unknown))
          return yield* RecordingInvalid.make({
            file: unknown.value,
            reason: `named for no beat with a line; name it <beat>${path.extname(unknown.value)}, one of ${[...beats.keys()].join(', ')}`,
          });
        const twice = Arr.head(
          files.filter((f, i) => files.findIndex((g) => beatNamed(g) === beatNamed(f)) !== i),
        );
        if (Option.isSome(twice))
          return yield* RecordingInvalid.make({
            file: twice.value,
            reason: `a second recording of beat "${beatNamed(twice.value)}"; keep one`,
          });
        const wanted = [...beats.values()].flatMap((beat) =>
          files
            .filter((f) => beatNamed(f) === beat.id && allowed(options.only, beat.id))
            .map((file) => ({ beat, file })),
        );
        if (wanted.length === 0)
          return yield* RecordingInvalid.make({
            file: dir,
            reason: `no recordings named for a beat to import (${RECORDING_EXTENSIONS.join(' ')})`,
          });
        return wanted;
      });

      /** One file: the beat `--only` names, or the one it is named for. */
      const single = Effect.fn('Takes.single')(function* (
        film: LoadedFilm,
        file: string,
        options: ImportOptions,
      ) {
        const id = Option.getOrElse(onlyOne(options.only), () => beatNamed(file));
        if (!allowed(options.only, id))
          return yield* RecordingInvalid.make({
            file,
            reason: 'one recording is one beat: give --only just the beat it is',
          });
        return [{ beat: yield* beatFor(film, id, file), file }];
      });

      /**
       * One reading of the whole script, cut beat by beat at the quietest
       * silence either side of each. Every beat is placed and cut, so `--only`
       * picks its beats from a reading that is already cut, never from one
       * placed against only some of the script.
       */
      const whole = Effect.fn('Takes.whole')(function* (
        film: LoadedFilm,
        file: string,
        options: ImportOptions,
      ) {
        const beats = [...(yield* beatsById(film)).values()];
        const recording = yield* media.load(file, MIX_RATE);
        const heard = yield* Effect.fromResult(heardWords(yield* elevenLabs.stt(file), file));
        const spans: ReadonlyArray<BeatSpan> = yield* Effect.fromResult(
          placeBeats(beats, heard, recording.frames / recording.rate),
        );
        const cuts = cutsAround(spans, recording);
        const original = yield* keepOriginal(film, 'whole', file);
        const chosen = Arr.zip(beats, cuts).filter(([beat]) => allowed(options.only, beat.id));
        const made = yield* Effect.forEach(chosen, ([beat, cut]) =>
          attempt(
            film,
            beat,
            {
              file: `${file}#${beat.id}`,
              original,
              cut: Option.some({ from: cut.from, to: cut.to }),
            },
            cutPcm(recording, cut),
          ).pipe(Effect.map((a) => ({ beat, made: a }))),
        );
        yield* Effect.log(`takes.whole file=${file} beats=${cuts.length} imported=${made.length}`);
        return made;
      });

      const importPath = Effect.fn('Takes.importPath')(function* (
        film: LoadedFilm,
        at: string,
        options: ImportOptions,
      ) {
        if (options.whole) {
          const made = yield* whole(film, at, options);
          return yield* Effect.forEach(made, ({ beat, made: m }) =>
            keep(film, beat, m, forBeat(options, beat.id)),
          );
        }
        // A path named as a recording is one; anything else is a folder of them.
        const recordings = yield* Effect.suspend(() => {
          if (isRecording(at)) return single(film, at, options);
          return folder(film, at, options);
        });
        return yield* Effect.forEach(recordings, ({ beat, file }) =>
          importOne(film, beat, file, forBeat(options, beat.id)).pipe(
            Effect.tapError((error) =>
              Effect.logError(`takes.failed id=${beat.id} error=${error._tag}`),
            ),
          ),
        );
      });

      const attempts = Effect.fn('Takes.attempts')(function* (film: LoadedFilm, beat: string) {
        const stored = yield* store.read(ledger(film, beat));
        return [...stored.attempts].reverse();
      });

      const keepAttempt = Effect.fn('Takes.keepAttempt')(function* (
        film: LoadedFilm,
        id: string,
        file: string,
        options: BeatOptions,
      ) {
        const beat = yield* beatFor(film, id, file);
        const made = Arr.findFirst(yield* attempts(film, id), (a) => a.file === file);
        if (Option.isNone(made))
          return yield* RecordingInvalid.make({
            file,
            reason: `no attempt of beat "${id}" by that name`,
          });
        // An attempt recorded for other words is not this line's take.
        if (made.value.take.hash !== hashText(beat.script))
          return yield* RecordingInvalid.make({
            file,
            reason: `recorded for an earlier line of beat "${id}"; record it again`,
          });
        return yield* keep(film, beat, made.value, options);
      });

      const attemptFile = Effect.fn('Takes.attemptFile')(function* (
        film: LoadedFilm,
        beat: string,
        file: string,
      ) {
        // Only a name the ledger holds: a request's path never reaches the disk as given.
        const known = Arr.findFirst(yield* attempts(film, beat), (a) => a.file === file);
        return Option.map(known, (a) => path.join(attemptsDir(film, beat), a.file));
      });

      return Takes.of({
        importPath,
        importBeat,
        attempts,
        attemptFile,
        keepAttempt,
      });
    }),
  );
}
