// The lab's studio: the handlers of the lab API's `studio` group
// (`core/api.ts`), which its panel calls to record the film's voice in the
// browser, beat by beat. A recording posted for a beat goes through the same
// pipeline as `film takes import` (Takes: load, trim, level, encode,
// transcribe, time, keep) and the track is remixed, so the page plays the
// new take at once; a take that says something else is refused as a
// TakeMismatch naming the attempt it saved, which "accept anyway" keeps. The
// routes answer only the lab's own page for its film, as the lab's other
// writes do (the gate in `api-server.ts`), with a body of at most
// STUDIO_MAX_BODY bytes.

import {
  Array as Arr,
  Effect,
  FileSystem,
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
import { type VoiceTiming } from '../core/schema.ts';
import { type Part, type SheetBeat, sheetBeats } from '../core/sheet.ts';
import {
  STUDIO_IMPORT_IDLE_S,
  STUDIO_MAX_BODY,
  type StudioBeat,
  type StudioPart,
  type StudioTake,
} from '../core/studio.ts';
import { Connection, answered, named } from './api-server.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  RecordingLossy,
  TakeMismatch,
  UnknownScene,
} from './errors.ts';
import { FilmRepo, type LoadedFilm } from './film-repo.ts';
import { Mixer } from './mixer.ts';
import { type Beat, beatsOf } from './narrator.ts';
import { quotesOf } from './script-sheet.ts';
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

/** A sheet part as the wire carries it. */
const wirePart = (part: Part): StudioPart => {
  if (part._tag === 'Line')
    return Option.match(part.voice, {
      onNone: () => ({ kind: 'line', text: part.text }),
      onSome: (voice) => ({ kind: 'line', voice, text: part.text }),
    });
  return Option.match(part.by, {
    onNone: () => ({ kind: 'quotation', text: part.text }),
    onSome: (by) => ({ kind: 'quotation', text: part.text, by }),
  });
};

/** One beat's row: its sheet text, the take the timings name, and where it stands. */
const beatRow = (
  film: LoadedFilm,
  beat: Beat,
  sheet: Option.Option<SheetBeat>,
  attempts: number,
): StudioBeat => {
  const state = takeState(beat.id, beat.script, film.timings, voiceKey(film.voice));
  const timing = Option.fromNullishOr(film.timings.scenes[beat.id]);
  const take = Option.match(timing, {
    onNone: () => ({}),
    onSome: (t: VoiceTiming) => ({
      take: { file: t.file, duration: t.duration, source: t.source },
    }),
  });
  return {
    id: beat.id,
    file: `${beat.id}.wav`,
    parts: Option.match(sheet, { onNone: () => [], onSome: (s) => s.parts.map(wirePart) }),
    sources: Option.match(sheet, { onNone: () => [], onSome: (s) => s.sources }),
    state: STATES[state._tag],
    ...staleness(state),
    recorded: Option.exists(timing, (t) => t.source === 'recorded'),
    ...take,
    attempts,
  };
};

const isMismatch = Schema.is(TakeMismatch);

/** The film as it is stored now: a take kept a moment ago is in its timings. */
const current = (film: string) =>
  Effect.gen(function* () {
    return yield* (yield* FilmRepo).load(film);
  });

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
  const known = (yield* Effect.fromResult(beatsOf(yield* current(film)))).map((b) => b.id);
  if (!known.includes(params.beat)) return yield* UnknownScene.make({ scene: params.beat, known });
  return { film, beat: params.beat };
});

/** The kept take, remixed into the track, as the panel reads it. */
const kept = Effect.fn('studio.kept')(function* (film: string, imported: Imported) {
  const mixed = yield* (yield* Mixer).mix(film, { stems: false, score: Option.none() }).pipe(
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
    timings: (yield* current(film)).timings,
    mixed,
  };
  return take;
});

/** A take refused for what it says, naming the attempt it saved to keep anyway. */
const mismatch = Effect.fn('studio.mismatch')(function* (film: string, error: TakeMismatch) {
  const saved = Arr.head(yield* (yield* Takes).attempts((yield* current(film)).paths, error.id));
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
    const keeping = <E, R>(film: string, make: Effect.Effect<Imported, E, R>) =>
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
            const repo = yield* FilmRepo;
            const takes = yield* Takes;
            const loaded = yield* current(film);
            const beats = (yield* Effect.fromResult(beatsOf(loaded))).filter(
              (b) => b.text.length > 0,
            );
            const lines = Option.getOrElse(yield* repo.script(film), () =>
              loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
            );
            const sheet = yield* Effect.fromResult(sheetBeats(lines, yield* quotesOf(loaded)));
            const rows = yield* Effect.forEach(beats, (beat) =>
              Effect.map(takes.attempts(loaded.paths, beat.id), (attempts) =>
                beatRow(
                  loaded,
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
                  return yield* (yield* Takes).importBeat(yield* current(film), beat, file, {
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
            const loaded = yield* current(film);
            const timing = Option.fromNullishOr(loaded.timings.scenes[beat]);
            const script = Arr.findFirst(
              yield* Effect.fromResult(beatsOf(loaded)),
              (b) => b.id === beat,
            );
            const attempts = yield* (yield* Takes).attempts(loaded.paths, beat);
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
              (yield* current(film)).paths,
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
            const takes = yield* Takes;
            return yield* keeping(
              film,
              current(film).pipe(
                Effect.flatMap((loaded) =>
                  takes.keepAttempt(loaded, beat, payload.file, {
                    acceptMismatch: payload.acceptMismatch === true,
                  }),
                ),
              ),
            );
          }),
        ),
      );
  }),
);
