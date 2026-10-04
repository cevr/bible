// The lab's studio: the handlers of the lab API's `studio` group
// (`core/api.ts`), which its panel calls to record the film's voice in the
// browser, beat by beat. A recording posted for a beat goes through the same
// pipeline as `film takes import` (Takes: load, trim, level, encode,
// transcribe, time) into an attempt, and the attempt is kept as the beat's
// take by `keepVoice` (`choices.ts`), the one way an attempt becomes a take,
// as Keep on an earlier attempt and the Choices view's pick are: in a fresh
// process that reads the script as it stands and remixes the track, so the
// page plays the new take at once; under the SourceWriter's lock, one keep at
// a time with every other write; and undoable, the replaced take brought back
// with the timings. The lab runs for hours and keeps the film's modules as it
// first imported them, so the studio reads the script, the voice and the
// beats from a fresh process too (`FreshFilm.reading`, kept under the film's
// source stamp): a line fixed while the lab is open reaches the sheet, the
// take and the mix at once. A take that says something else is refused as a
// TakeMismatch naming its attempt, which "accept anyway" keeps. The routes
// answer only the lab's own page for its film, as the lab's other writes do
// (the gate in `api-server.ts`), with a body of at most STUDIO_MAX_BODY
// bytes.

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
  String as Str,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { type TakeState, hashText, takeState, voiceKey } from '../core/narration.ts';
import { type Timings, type Voice, type VoiceTiming } from '../core/schema.ts';
import {
  type ReadBeat,
  type StudioBeat,
  type StudioReading,
  type StudioTake,
} from '../core/studio.ts';
import type { SheetBeat } from '../core/sheet.ts';
import type { PlatformError } from 'effect/PlatformError';
import { answered } from './api-server.ts';
import { UnknownScene } from '../core/errors.ts';
import { AttemptUnknown, AudioInvalid, RecordingLossy, TakeMismatch } from '../core/refusals.ts';
import { keepVoice } from './choices.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, type FilmName, Stamped, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm } from './fresh-film.ts';
import type { VoicedFilm } from './narrator.ts';
import { IMMUTABLE, serveFile } from './review-file.ts';
import { Takes } from './takes.ts';

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
  const film = yield* filmNamed(params.film);
  const known = (yield* reading(film)).beats.map((b) => b.id);
  if (!known.includes(params.beat)) return yield* UnknownScene.make({ scene: params.beat, known });
  return { film, beat: params.beat };
});

/** A take refused for what it says, naming its attempt, which "accept anyway" keeps. */
const mismatch = Effect.fn('studio.mismatch')(function* (error: TakeMismatch, attempt: string) {
  yield* Effect.logWarning(`studio.mismatch beat=${error.id} wer=${(error.wer * 100).toFixed(1)}%`);
  return yield* TakeMismatch.make({
    id: error.id,
    script: error.script,
    heard: error.heard,
    wer: error.wer,
    attempt,
  });
});

/**
 * `attempt` kept as `beat`'s take (`keepVoice`: fresh, remixed, under the
 * writer's lock, undoable), answered as the panel reads it.
 */
const keeping = Effect.fn('studio.keeping')(function* (
  film: FilmName,
  beat: string,
  attempt: string,
  acceptMismatch: boolean,
) {
  const { kept } = yield* keepVoice(film, beat, attempt, { acceptMismatch }).pipe(
    Effect.catchTag('TakeMismatch', (error) => mismatch(error, attempt)),
  );
  const take: StudioTake = {
    beat,
    take: kept.take,
    transcript: kept.heard,
    wer: kept.wer,
    timings: yield* timingsOf(film),
    mixed: kept.mixed,
  };
  return take;
});

/**
 * The studio's handlers. A posted recording is made an attempt at once
 * (two posted together each transcribe on their own); every keep goes through
 * `keepVoice`, so keeps, and the mix after each, run one at a time with
 * every other write the lab makes, and never interleave.
 */
export const studioGroup = HttpApiBuilder.group(LabHttpApi, 'studio', (handlers) =>
  handlers
    .handle('beats', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
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
          const { film, beat } = yield* filmBeat(params);
          const bytes = yield* Effect.fromResult(Base64.decode(payload.audio)).pipe(
            Effect.mapError(() => AudioInvalid.make({ reason: 'the audio is not base64' })),
          );
          const extension = yield* Effect.fromResult(extensionOf(payload.type));
          const fs = yield* FileSystem.FileSystem;
          const made = yield* Effect.scoped(
            Effect.gen(function* () {
              const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-studio-' });
              const file = (yield* Path.Path).join(dir, `recording${extension}`);
              yield* fs.writeFile(file, bytes);
              return yield* (yield* Takes).recordAttempt(yield* voiced(film), beat, file);
            }),
          );
          return yield* keeping(film, beat, made.file, payload.acceptMismatch === true);
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
              transcript: a.heard,
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
    .handle('attempt', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const { film, beat } = yield* filmBeat(params);
          const found = yield* (yield* Takes).attemptFile(yield* pathsOf(film), beat, params.file);
          if (Option.isNone(found)) return yield* AttemptUnknown.make({ beat, file: params.file });
          // A phone's Safari plays and seeks an <audio> by byte ranges.
          return yield* serveFile(request, found.value, IMMUTABLE);
        }),
      ),
    )
    .handle('keep', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const { film, beat } = yield* filmBeat(params);
          return yield* keeping(film, beat, payload.file, payload.acceptMismatch === true);
        }),
      ),
    ),
);
