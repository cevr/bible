// `film read`: what the lab reads of a film, in this process, as the film's
// sources stand on disk. The lab runs these in a fresh process (`FreshFilm`,
// `fresh-film.ts`) because its own imports of the film's script, voice and
// scenes are as they were at its start. Each prints one line of JSON
// (`FreshLine`) on stdout; logs go to stderr. A run that fails answers with
// its failure (`answering`: a refusal as itself, any other as ServerFailed),
// so a film that does not load reads as one sentence.
//
//   film read voice <film>
//       what the studio reads: the voice, how speech-to-text writes the
//       script's names, each beat's line, and the reading sheet
//   film read cue <film> <scene> <cue> [--spans <json>]
//       the cue on its scene's clock, as the scene file now declares it (or
//       with `spans` in place of its own: a write the lab has not made yet),
//       or why the scene's timeline does not resolve

import { Effect, Option, Result } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { LineError, UnknownVoice } from '../core/errors.ts';
import { type Placed, sceneClock, sceneOf } from '../core/layout.ts';
import type { Span } from '../core/schema.ts';
import { type Quote, type ScriptLine, sheetBeats } from '../core/sheet.ts';
import type { StudioReading } from '../core/studio.ts';
import { resolveTimeline } from '../core/timeline.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { CueRead, TimelineJson, VoiceRead, answering, printLine } from './fresh-film.ts';
import { beatsOf } from './narrator.ts';
import { quotesOf } from './script-sheet.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/**
 * What the studio reads of `loaded`: its voice, its script's `heardAs`, each
 * beat's line, and the sheet set from `script` (each scene's `say` when the
 * film keeps no `script.ts`) and the film's quotations. Pure.
 */
export const studioReading = (
  loaded: LoadedFilm,
  script: Option.Option<ReadonlyArray<ScriptLine>>,
  quotes: ReadonlyArray<Quote>,
): Result.Result<StudioReading, UnknownVoice | LineError> =>
  Result.gen(function* () {
    const lines = Option.getOrElse(script, () =>
      loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
    );
    return {
      voice: loaded.voice,
      heardAs: loaded.heardAs,
      beats: yield* beatsOf(loaded),
      sheet: yield* sheetBeats(lines, quotes),
    };
  });

/** What the studio reads of the film as it is stored now. */
export const readingOf = Effect.fn('film.read.voice.reading')(function* (loaded: LoadedFilm) {
  const script = yield* (yield* FilmRepo).script(loaded.paths.name);
  return yield* Effect.fromResult(studioReading(loaded, script, yield* quotesOf(loaded)));
});

/**
 * `cue` on `scene`'s clock among the placed scenes, `spans` over the scene's
 * own, or why the scene's timeline does not resolve; neither when the scene
 * or the cue is not there. Pure.
 */
export const cueOf = (
  placed: ReadonlyArray<Placed>,
  scene: string,
  cue: string,
  spans: Readonly<Record<string, Span>>,
): CueRead =>
  Result.match(sceneOf(placed, scene), {
    onFailure: () => CueRead.make({}),
    onSuccess: (p) =>
      Result.match(resolveTimeline({ ...p.spec.timeline, ...spans }, sceneClock(p)), {
        onFailure: (e) => CueRead.make({ unresolved: e.message }),
        onSuccess: (cues) =>
          CueRead.make(
            Option.match(Option.fromUndefinedOr(cues.get(cue)), {
              onNone: () => ({}),
              onSome: (r) => ({ resolved: r }),
            }),
          ),
      }),
  });

const voice = Command.make(
  'voice',
  { film },
  Effect.fn('film.read.voice')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(VoiceRead.make({ reading: yield* readingOf(loaded) }));
  }, answering),
).pipe(
  Command.withDescription(
    "What the lab's studio reads of the film (its voice, each beat's line, the reading sheet), as one line of JSON",
  ),
);

const cue = Command.make(
  'cue',
  {
    film,
    scene: Argument.String('scene').pipe(Argument.withDescription('the scene, by id')),
    cue: Argument.String('cue').pipe(Argument.withDescription('the cue, by name')),
    spans: Flag.String('spans').pipe(
      Flag.withSchema(TimelineJson),
      Flag.optional,
      Flag.withDescription("spans (JSON) in place of the scene's own: a write not made yet"),
    ),
  },
  Effect.fn('film.read.cue')(function* (input) {
    const placed = yield* placeFilm(yield* (yield* FilmRepo).load(input.film));
    const spans = Option.getOrElse(input.spans, () => ({}));
    yield* printLine(cueOf(placed, input.scene, input.cue, spans));
  }, answering),
).pipe(
  Command.withDescription(
    "A cue on its scene's clock as the scene file declares it (or with --spans in its place), or why its timeline does not resolve, as one line of JSON",
  ),
);

/** `film read`, run fresh by the lab. */
export const read = Command.make('read').pipe(
  Command.withDescription(
    'What the lab reads of a film, fresh from disk, as one line of JSON (the lab runs these)',
  ),
  Command.withSubcommands([voice, cue]),
);
