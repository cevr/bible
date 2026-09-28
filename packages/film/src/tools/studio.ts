// The lab's studio: the routes its panel calls to record the film's voice in
// the browser, beat by beat. A recording posted for a beat goes through the
// same pipeline as `film takes import` (Takes: load, trim, level, encode,
// transcribe, time, keep) and the track is remixed, so the page plays the
// new take at once; a take that says something else is refused with the
// attempt it saved, which "accept anyway" keeps. Every body and answer is a
// Schema from `core/studio.ts`, and the routes answer only the lab's own page
// for its film (`admit`, `forFilm`), as the lab's other writes do.
//
//   GET  /lab/<film>/studio/beats                       StudioBeats: each beat's sheet text and take state
//   POST /lab/<film>/studio/takes/:beat                 TakePost → StudioTake, or StudioRefusal (422 TakeMismatch …)
//   GET  /lab/<film>/studio/takes/:beat/attempts        StudioAttempts, newest first
//   GET  /lab/<film>/studio/takes/:beat/attempts/:file  the attempt's MP3, to hear it again
//   POST /lab/<film>/studio/takes/:beat/keep            KeepPost → StudioTake, or StudioRefusal

import {
  Array as Arr,
  Effect,
  Encoding,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
  String as Str,
} from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { type TakeState, hashText, takeState, voiceKey } from '../core/narration.ts';
import { labBase, type VoiceTiming } from '../core/schema.ts';
import { type Part, type SheetBeat, sheetBeats } from '../core/sheet.ts';
import {
  KeepPost,
  StudioAttempts,
  type StudioBeat,
  StudioBeats,
  type StudioPart,
  StudioRefusal,
  StudioTake,
  TakePost,
} from '../core/studio.ts';
import { AudioInvalid } from './errors.ts';
import { FilmRepo, type LoadedFilm } from './film-repo.ts';
import { type LabHandler, admit, forFilm } from './lab.ts';
import { Mixer } from './mixer.ts';
import { type Beat, beatsOf } from './narrator.ts';
import { quotesOf } from './script-sheet.ts';
import { type Imported, Takes } from './takes.ts';

/** The file a browser's recording is written to, by its media type: ffmpeg reads it by name. */
const EXTENSIONS = new Map([
  ['audio/webm', '.webm'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/x-m4a', '.m4a'],
  ['audio/aac', '.aac'],
  ['audio/mpeg', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/wave', '.wav'],
  ['audio/flac', '.flac'],
]);

const extensionOf = (type: string): Result.Result<string, AudioInvalid> => {
  const bare = Arr.headNonEmpty(Str.split(type, ';')).trim().toLowerCase();
  return Result.fromOption(Option.fromNullishOr(EXTENSIONS.get(bare)), () =>
    AudioInvalid.make({ reason: `a recording of type "${type}"` }),
  );
};

const BeatParams = Schema.Struct({ beat: Schema.String });
const AttemptParams = Schema.Struct({ beat: Schema.String, file: Schema.String });

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
  const named = Option.fromNullishOr(film.timings.scenes[beat.id]);
  const take = Option.match(named, {
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
    recorded: Option.exists(named, (t) => t.source === 'recorded'),
    ...take,
    attempts,
  };
};

/**
 * The status a failure answers with: a request the studio cannot read 400,
 * a take it will not keep 422, a missing film 404, the transcriber failing
 * 502, the rest 500.
 */
const statusOf = (tag: string) => {
  if (tag === 'SchemaError' || tag === 'HttpServerError' || tag === 'AudioInvalid') return 400;
  if (tag === 'FilmNotFound') return 404;
  const refused = ['TakeMismatch', 'RecordingInvalid', 'UnknownVoice', 'MediaFailed'];
  if (refused.includes(tag)) return 422;
  if (tag === 'ElevenLabsFailed') return 502;
  return 500;
};

const refusalJson = HttpServerResponse.schemaJson(StudioRefusal);
const beatsJson = HttpServerResponse.schemaJson(StudioBeats);
const takeJson = HttpServerResponse.schemaJson(StudioTake);
const attemptsJson = HttpServerResponse.schemaJson(StudioAttempts);

/** Answer every failure with its status and a StudioRefusal, logged: never a hung request. */
const handled = <E extends { readonly _tag: string; readonly message: string }, R>(
  route: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  route.pipe(
    Effect.catch((error) =>
      Effect.logWarning(`studio.request.failed tag=${error._tag} reason=${error.message}`).pipe(
        Effect.andThen(
          refusalJson(
            { _tag: error._tag, message: error.message },
            { status: statusOf(error._tag) },
          ),
        ),
      ),
    ),
    Effect.orDie,
  );

export const studioRoutes = (film: string) => {
  const base: `/lab/${string}` = `${labBase(film)}/studio`;

  /** The film as it is stored now: a take kept a moment ago is in its timings. */
  const current = Effect.gen(function* () {
    return yield* (yield* FilmRepo).load(film);
  });

  /** The kept take, remixed into the track, as the panel reads it. */
  const kept = Effect.fn('studio.kept')(function* (imported: Imported) {
    const mixed = yield* (yield* Mixer).mix(film, { stems: false }).pipe(
      Effect.as(true),
      Effect.catch((error) =>
        Effect.logWarning(
          `studio.mix.failed film=${film} tag=${error._tag} reason=${error.message}`,
        ).pipe(Effect.as(false)),
      ),
    );
    return yield* takeJson({
      beat: imported.id,
      take: imported.take,
      heard: imported.heard,
      wer: imported.wer,
      timings: (yield* current).timings,
      mixed,
    });
  });

  /** A take refused for what it says, with the attempt it saved to keep anyway. */
  const mismatch = Effect.fn('studio.mismatch')(function* (
    beat: string,
    error: {
      readonly script: string;
      readonly heard: string;
      readonly wer: number;
      readonly message: string;
    },
  ) {
    const saved = Arr.head(yield* (yield* Takes).attempts(yield* current, beat));
    yield* Effect.logWarning(`studio.mismatch beat=${beat} wer=${(error.wer * 100).toFixed(1)}%`);
    return yield* refusalJson(
      {
        _tag: 'TakeMismatch',
        message: error.message,
        beat,
        script: error.script,
        heard: error.heard,
        wer: error.wer,
        ...Option.match(saved, { onNone: () => ({}), onSome: (a) => ({ attempt: a.file }) }),
      },
      { status: 422 },
    );
  });

  return HttpRouter.addAll([
    HttpRouter.route(
      'GET',
      `${base}/beats`,
      handled(
        Effect.gen(function* () {
          const repo = yield* FilmRepo;
          const takes = yield* Takes;
          const loaded = yield* current;
          const beats = (yield* Effect.fromResult(beatsOf(loaded))).filter(
            (b) => b.text.length > 0,
          );
          const lines = Option.getOrElse(yield* repo.script(film), () =>
            loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
          );
          const sheet = sheetBeats(lines, yield* quotesOf(loaded));
          const rows = yield* Effect.forEach(beats, (beat) =>
            Effect.map(takes.attempts(loaded, beat.id), (attempts) =>
              beatRow(
                loaded,
                beat,
                Arr.findFirst(sheet, (s) => s.id === beat.id),
                attempts.length,
              ),
            ),
          );
          return yield* beatsJson({ film, beats: rows });
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/takes/:beat`,
      handled(
        Effect.gen(function* () {
          const { beat } = yield* HttpRouter.schemaPathParams(BeatParams);
          const post = yield* HttpServerRequest.schemaBodyJson(TakePost);
          const bytes = yield* Effect.fromResult(Encoding.decodeBase64(post.audio)).pipe(
            Effect.mapError(() => AudioInvalid.make({ reason: 'the audio is not base64' })),
          );
          const extension = yield* Effect.fromResult(extensionOf(post.type));
          const fs = yield* FileSystem.FileSystem;
          const imported = yield* Effect.scoped(
            Effect.gen(function* () {
              const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-studio-' });
              const file = (yield* Path.Path).join(dir, `${beat}${extension}`);
              yield* fs.writeFile(file, bytes);
              return yield* (yield* Takes).importBeat(yield* current, beat, file, {
                acceptMismatch: post.acceptMismatch === true,
              });
            }),
          ).pipe(Effect.result);
          return yield* Result.match(imported, {
            onSuccess: kept,
            onFailure: (error) => {
              if (error._tag === 'TakeMismatch') return mismatch(beat, error);
              return Effect.fail(error);
            },
          });
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      `${base}/takes/:beat/attempts`,
      handled(
        Effect.gen(function* () {
          const { beat } = yield* HttpRouter.schemaPathParams(BeatParams);
          const loaded = yield* current;
          const named = Option.fromNullishOr(loaded.timings.scenes[beat]);
          const script = Arr.findFirst(
            yield* Effect.fromResult(beatsOf(loaded)),
            (b) => b.id === beat,
          );
          const attempts = yield* (yield* Takes).attempts(loaded, beat);
          return yield* attemptsJson({
            beat,
            attempts: attempts.map((a) => ({
              file: a.file,
              heard: a.heard,
              wer: a.wer,
              at: a.at,
              duration: a.take.duration,
              kept: Option.exists(named, (t) => t.file === a.file),
              current: Option.exists(script, (b) => a.take.hash === hashText(b.script)),
            })),
          });
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      `${base}/takes/:beat/attempts/:file`,
      handled(
        Effect.gen(function* () {
          const { beat, file } = yield* HttpRouter.schemaPathParams(AttemptParams);
          const found = yield* (yield* Takes).attemptFile(yield* current, beat, file);
          if (Option.isNone(found))
            return HttpServerResponse.text('no such attempt', { status: 404 });
          const bytes = yield* (yield* FileSystem.FileSystem).readFile(found.value);
          return HttpServerResponse.uint8Array(bytes, { contentType: 'audio/mpeg' });
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/takes/:beat/keep`,
      handled(
        Effect.gen(function* () {
          const { beat } = yield* HttpRouter.schemaPathParams(BeatParams);
          const post = yield* HttpServerRequest.schemaBodyJson(KeepPost);
          const imported = yield* (yield* Takes)
            .keepAttempt(yield* current, beat, post.file, {
              acceptMismatch: post.acceptMismatch === true,
            })
            .pipe(Effect.result);
          return yield* Result.match(imported, {
            onSuccess: kept,
            onFailure: (error) => {
              if (error._tag === 'TakeMismatch') return mismatch(beat, error);
              return Effect.fail(error);
            },
          });
        }),
      ),
    ),
  ]);
};

/** Whether a request is for the studio's routes of `film`. Pure. */
export const isStudio = (request: Request, film: string): boolean =>
  new URL(request.url).pathname.startsWith(`${labBase(film)}/studio/`);

/**
 * The studio's routes as a web handler over the services the caller runs
 * with (the film, its takes, the mixer), closed when the scope closes. It
 * answers only what the lab would: the lab's own page (`admit`), for its film
 * (`forFilm`).
 */
export const studioHandler = Effect.fn('film.studio.handler')(function* (film: string) {
  const services = yield* Effect.context<
    FilmRepo | Takes | Mixer | FileSystem.FileSystem | Path.Path
  >();
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(studioRoutes(film), { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  );
  const run = Effect.runPromiseWith(services);
  const studio: LabHandler = (request, server) =>
    Option.match(
      Option.orElse(admit(request, server), () => forFilm(request, film)),
      {
        onNone: () => handler(request, services),
        onSome: (refusal) =>
          run(
            Effect.logWarning(
              `studio.request.refused method=${request.method} path=${new URL(request.url).pathname} status=${refusal.status} reason="${refusal.reason}"`,
            ).pipe(
              Effect.andThen(
                refusalJson(
                  { _tag: 'LabRequestRefused', message: refusal.reason },
                  { status: refusal.status },
                ),
              ),
              Effect.map(HttpServerResponse.toWeb),
              Effect.orDie,
            ),
          ),
      },
    );
  return studio;
});

/** The lab with its studio: a request under `/lab/<film>/studio/` goes to the studio, the rest to the lab. */
export const withStudio =
  (film: string, lab: LabHandler, studio: LabHandler): LabHandler =>
  (request, server) => {
    if (isStudio(request, film)) return studio(request, server);
    return lab(request, server);
  };
