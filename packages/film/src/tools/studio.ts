// The lab's studio: the handlers of the lab API's `studio` group
// (`core/api.ts`), which its panel calls to record the film's voice in the
// browser, beat by beat. A recording posted for a beat goes through the same
// pipeline as `film takes import` (Takes: load, trim, level, encode,
// transcribe, time, keep) and the track is remixed, so the page plays the
// new take at once. The lab runs for hours and keeps the film's modules as it
// first imported them, so the studio reads the script, the voice and the
// beats from a fresh process (`FreshFilm.reading`, kept under the film's
// source stamp) and remixes in one (`film mix`): a line fixed while the lab
// is open reaches the sheet, the take and the mix at once; a take that says something else is refused as a
// TakeMismatch naming the attempt it saved, which "accept anyway" keeps. The
// routes answer only the lab's own page for its film, as the lab's other
// writes do (the gate in `api-server.ts`), with a body of at most
// STUDIO_MAX_BODY bytes.

import {
  Array as Arr,
  Cache,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
  String as Str,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { type TakeState, hashText, takeState, voiceKey } from '../core/narration.ts';
import { type Timings, type Voice, type VoiceTiming } from '../core/schema.ts';
import {
  type ReadBeat,
  STUDIO_IMPORT_IDLE_S,
  STUDIO_MAX_BODY,
  type StudioBeat,
  type StudioReading,
  type StudioTake,
} from '../core/studio.ts';
import type { SheetBeat } from '../core/sheet.ts';
import type { PlatformError } from 'effect/PlatformError';
import { Connection, answered, named } from './api-server.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  RecordingLossy,
  TakeMismatch,
  UnknownScene,
} from './errors.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, type FilmName, Stamped } from './film-repo.ts';
import { type FreshError, FreshFilm } from './fresh-film.ts';
import type { VoicedFilm } from './narrator.ts';
import { keptWhenMade } from './review.ts';
import { type Imported, Takes } from './takes.ts';

/**
 * The file a recording is written to, by its media type (`Media.load` reads it by
 * name): lossless only, since the take made from it is the film's master.
 */
const LOSSLESS = new Map([
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/wave', '.wav'],
  ['audio/vnd.wave', '.wav'],
  ['audio/flac', '.flac'],
  ['audio/x-flac', '.flac'],
]);

/** What a browser's MediaRecorder makes: every one lossy. */
const LOSSY = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg'];

const extensionOf = (type: string): Result.Result<string, AudioInvalid | RecordingLossy> => {
  const bare = Arr.headNonEmpty(Str.split(type, ';')).trim().toLowerCase();
  if (LOSSY.includes(bare)) return Result.fail(RecordingLossy.make({ type }));
  return Result.fromOption(Option.fromNullishOr(LOSSLESS.get(bare)), () =>
    AudioInvalid.make({ reason: `a recording of type "${type}"` }),
  );
};

export { STUDIO_MAX_BODY };

/** An attempt's audio as the page plays it back. */
const AUDIO_TYPES = new Map([
  ['.flac', 'audio/flac'],
  ['.mp3', 'audio/mpeg'],
]);

/** A take's state as the panel names it. */
const STATES = { Recorded: 'recorded', Staging: 'staging', Stale: 'stale' } as const;

/** Why a stale take is stale, for the row; nothing for a current one. */
const staleness = (state: TakeState): Pick<StudioBeat, 'staleReason'> => {
  if (state._tag === 'Stale') return { staleReason: state.reason };
  return {};
};

/** One beat's row: its sheet text, the take the timings name, and where it stands. */
const beatRow = (
  timings: Timings,
  voice: Voice,
  beat: ReadBeat,
  sheet: Option.Option<SheetBeat>,
  attempts: number,
): StudioBeat => {
  const state = takeState(beat.id, beat.script, timings, voiceKey(voice));
  const timing = Option.fromNullishOr(timings.scenes[beat.id]);
  const take = Option.match(timing, {
    onNone: () => ({}),
    onSome: (t: VoiceTiming) => ({
      take: { file: t.file, duration: t.duration, source: t.source },
    }),
  });
  return {
    id: beat.id,
    file: `${beat.id}.wav`,
    parts: Option.match(sheet, { onNone: () => [], onSome: (s) => s.parts }),
    sources: Option.match(sheet, { onNone: () => [], onSome: (s) => s.sources }),
    state: STATES[state._tag],
    ...staleness(state),
    recorded: Option.exists(timing, (t) => t.source === 'recorded'),
    ...take,
    attempts,
  };
};

const isMismatch = Schema.is(TakeMismatch);

/** How many films' readings the lab keeps: one film, a few stamps of it. */
const READINGS_KEPT = 8;

interface StudioReadingsService {
  /** The film's script, voice and beats as they stand: read fresh only when its stamp moved. */
  readonly reading: (film: FilmName) => Effect.Effect<StudioReading, FreshError | PlatformError>;
}

/**
 * What the studio read of each film (`FreshFilm.reading`), kept under the
 * film's source stamp (`FilmFolder.stamp`), so the studio's routes cost a
 * fresh process only after a file under the film changed. A failed read is
 * not kept.
 */
export class StudioReadings extends Context.Service<StudioReadings, StudioReadingsService>()(
  '@bible/film/tools/StudioReadings',
) {
  static readonly layer = Layer.effect(
    StudioReadings,
    Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const folder = yield* FilmFolder;
      const read = yield* Cache.makeWith((at: Stamped) => fresh.reading(at.film), {
        capacity: READINGS_KEPT,
        timeToLive: keptWhenMade,
      });
      return StudioReadings.of({
        reading: (film) =>
          Effect.flatMap(folder.stamp(film), (stamp) =>
            Cache.get(read, new Stamped({ film, stamp })),
          ),
      });
    }),
  );
}

/** The film's script, voice and beats as they stand. */
const reading = (film: FilmName) => StudioReadings.use((readings) => readings.reading(film));

/** The film as a take is kept against it, as it stands. */
const voiced = Effect.fn('studio.voiced')(function* (film: FilmName) {
  const r = yield* reading(film);
  const paths = (yield* FilmFolder).paths(film);
  return { paths, voice: r.voice, heardAs: r.heardAs, beats: r.beats } satisfies VoicedFilm;
});

/** The film's timings as they are stored now: a take kept a moment ago is in them. */
const timingsOf = Effect.fn('studio.timings')(function* (film: FilmName) {
  return yield* (yield* ContentStore).read((yield* FilmFolder).paths(film).timings);
});

/** Where the film's narration and attempts are. */
const pathsOf = (film: FilmName) => FilmFolder.use((folder) => Effect.succeed(folder.paths(film)));

/**
 * The film a studio route names and its `:beat`, when that is one of the
 * film's beats; anything else (another name, a `/` or `..` smuggled in
 * encoded) fails UnknownScene before the route reads or writes a thing.
 */
const filmBeat = Effect.fn('studio.filmBeat')(function* (params: {
  readonly film: string;
  readonly beat: string;
}) {
  const film = yield* named(params.film);
  const known = (yield* reading(film)).beats.map((b) => b.id);
  if (!known.includes(params.beat)) return yield* UnknownScene.make({ scene: params.beat, known });
  return { film, beat: params.beat };
});

/** The kept take, the track rebuilt fresh (`film mix`), as the panel reads it. */
const kept = Effect.fn('studio.kept')(function* (film: FilmName, imported: Imported) {
  const mixed = yield* (yield* FreshFilm).remix(film).pipe(
    Effect.as(true),
    Effect.catch((error) =>
      Effect.logWarning(
        `studio.mix.failed film=${film} tag=${error._tag} reason=${error.message}`,
      ).pipe(Effect.as(false)),
    ),
  );
  const take: StudioTake = {
    beat: imported.id,
    take: imported.take,
    heard: imported.heard,
    wer: imported.wer,
    timings: yield* timingsOf(film),
    mixed,
  };
  return take;
});

/** A take refused for what it says, naming the attempt it saved to keep anyway. */
const mismatch = Effect.fn('studio.mismatch')(function* (film: FilmName, error: TakeMismatch) {
  const saved = Arr.head(yield* (yield* Takes).attempts(yield* pathsOf(film), error.id));
  yield* Effect.logWarning(`studio.mismatch beat=${error.id} wer=${(error.wer * 100).toFixed(1)}%`);
  return yield* TakeMismatch.make({
    id: error.id,
    script: error.script,
    heard: error.heard,
    wer: error.wer,
    ...Option.match(saved, { onNone: () => ({}), onSome: (a) => ({ attempt: a.file }) }),
  });
});

/**
 * A take posted (made, heard, kept and remixed, or an attempt kept) sends
 * nothing until it answers: its connection is held open for
 * STUDIO_IMPORT_IDLE_S, past the page's wait, where the server's idle limit
 * would close it under a long import. Other routes keep the server's limit.
 */
const holdOpen = Effect.gen(function* () {
  (yield* Connection).hold(STUDIO_IMPORT_IDLE_S);
});

/**
 * The studio's handlers. One write at a time: a take kept (its attempt, the
 * timings) and the mix after it finish before the next begins, so two takes
 * posted at once never interleave their writes or mix over each other.
 */
export const studioGroup = HttpApiBuilder.group(LabHttpApi, 'studio', (handlers) =>
  Effect.gen(function* () {
    const writing = yield* Semaphore.make(1);

    /** A take made (`make`) and, when kept, remixed, holding `writing` the whole way. */
    const keeping = <E, R>(film: FilmName, make: Effect.Effect<Imported, E, R>) =>
      writing.withPermits(1)(
        make.pipe(
          Effect.catchIf(
            (error): error is E & TakeMismatch => isMismatch(error),
            (error) => mismatch(film, error),
          ),
          Effect.flatMap((imported) => kept(film, imported)),
        ),
      );

    return handlers
      .handle('beats', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const film = yield* named(params.film);
            const { voice, beats, sheet } = yield* reading(film);
            const timings = yield* timingsOf(film);
            const spoken = beats.filter((b) => b.text.length > 0);
            const takes = yield* Takes;
            const paths = yield* pathsOf(film);
            const rows = yield* Effect.forEach(spoken, (beat) =>
              Effect.map(takes.attempts(paths, beat.id), (attempts) =>
                beatRow(
                  timings,
                  voice,
                  beat,
                  Arr.findFirst(sheet, (s) => s.id === beat.id),
                  attempts.length,
                ),
              ),
            );
            return { film, beats: rows };
          }),
        ),
      )
      .handle('take', ({ params, payload }) =>
        answered(
          Effect.gen(function* () {
            yield* holdOpen;
            const { film, beat } = yield* filmBeat(params);
            const bytes = yield* Effect.fromResult(Base64.decode(payload.audio)).pipe(
              Effect.mapError(() => AudioInvalid.make({ reason: 'the audio is not base64' })),
            );
            const extension = yield* Effect.fromResult(extensionOf(payload.type));
            const fs = yield* FileSystem.FileSystem;
            return yield* keeping(
              film,
              Effect.scoped(
                Effect.gen(function* () {
                  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-studio-' });
                  const file = (yield* Path.Path).join(dir, `recording${extension}`);
                  yield* fs.writeFile(file, bytes);
                  return yield* (yield* Takes).importBeat(yield* voiced(film), beat, file, {
                    acceptMismatch: payload.acceptMismatch === true,
                  });
                }),
              ),
            );
          }),
        ),
      )
      .handle('attempts', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const { film, beat } = yield* filmBeat(params);
            const timing = Option.fromNullishOr((yield* timingsOf(film)).scenes[beat]);
            const script = Arr.findFirst((yield* reading(film)).beats, (b) => b.id === beat);
            const attempts = yield* (yield* Takes).attempts(yield* pathsOf(film), beat);
            return {
              beat,
              attempts: attempts.map((a) => ({
                file: a.file,
                heard: a.heard,
                wer: a.wer,
                at: a.at,
                duration: a.take.duration,
                kept: Option.exists(timing, (t) => t.file === a.file),
                current: Option.exists(script, (b) => a.take.hash === hashText(b.script)),
              })),
            };
          }),
        ),
      )
      .handle('attempt', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const { film, beat } = yield* filmBeat(params);
            const found = yield* (yield* Takes).attemptFile(
              yield* pathsOf(film),
              beat,
              params.file,
            );
            if (Option.isNone(found))
              return yield* AttemptUnknown.make({ beat, file: params.file });
            const bytes = yield* (yield* FileSystem.FileSystem).readFile(found.value);
            const contentType = Option.getOrElse(
              Option.fromNullishOr(AUDIO_TYPES.get((yield* Path.Path).extname(found.value))),
              () => 'application/octet-stream',
            );
            return HttpServerResponse.uint8Array(bytes, { contentType });
          }),
        ),
      )
      .handle('keep', ({ params, payload }) =>
        answered(
          Effect.gen(function* () {
            yield* holdOpen;
            const { film, beat } = yield* filmBeat(params);
            return yield* keeping(
              film,
              Effect.gen(function* () {
                return yield* (yield* Takes).keepAttempt(yield* voiced(film), beat, payload.file, {
                  acceptMismatch: payload.acceptMismatch === true,
                });
              }),
            );
          }),
        ),
      );
  }),
);
