// `film read`: what the lab reads of a film, in this process, as the film's
// sources stand on disk. The lab runs these in a fresh process (`FreshFilm`,
// `fresh-film.ts`) because its own imports of the film's script, voice and
// scenes are as they were at its start. Each prints one line of JSON
// (`FreshLine`) on stdout; logs go to stderr.
//
//   film read voice <film>
//       what the studio reads: the voice, how speech-to-text writes the
//       script's names, each beat's line, and the reading sheet
//   film read cue <film> <scene> <cue>
//       the cue on its scene's clock, as the scene file now declares it

import { Effect, Option, Result } from 'effect';
import { Argument, Command } from 'effect/cli';
import type { LineError, UnknownVoice } from '../core/errors.ts';
import { type Placed, sceneClock, sceneOf } from '../core/layout.ts';
import type { ResolvedCue } from '../core/schema.ts';
import { type Part, type Quote, type ScriptLine, sheetBeats } from '../core/sheet.ts';
import type { StudioPart, StudioReading } from '../core/studio.ts';
import { resolveTimeline } from '../core/timeline.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { CueRead, VoiceRead, printLine } from './fresh-film.ts';
import { beatsOf } from './narrator.ts';
import { quotesOf } from './script-sheet.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

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
    const sheet = yield* sheetBeats(lines, quotes);
    return {
      voice: loaded.voice,
      heardAs: loaded.heardAs,
      beats: yield* beatsOf(loaded),
      sheet: sheet.map((beat) => ({
        id: beat.id,
        parts: beat.parts.map(wirePart),
        sources: beat.sources,
      })),
    };
  });

/** What the studio reads of the film as it is stored now. */
export const readingOf = Effect.fn('film.read.voice.reading')(function* (loaded: LoadedFilm) {
  const script = yield* (yield* FilmRepo).script(loaded.paths.name);
  return yield* Effect.fromResult(studioReading(loaded, script, yield* quotesOf(loaded)));
});

/** `cue` on `scene`'s clock among the placed scenes; none when either is missing or it does not resolve. Pure. */
export const cueOf = (
  placed: ReadonlyArray<Placed>,
  scene: string,
  cue: string,
): Option.Option<ResolvedCue> =>
  Option.flatMap(Result.getSuccess(sceneOf(placed, scene)), (p) =>
    Option.flatMap(Result.getSuccess(resolveTimeline(p.spec.timeline, sceneClock(p))), (cues) =>
      Option.fromUndefinedOr(cues.get(cue)),
    ),
  );

const voice = Command.make(
  'voice',
  { film },
  Effect.fn('film.read.voice')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(VoiceRead.make({ reading: yield* readingOf(loaded) }));
  }),
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
  },
  Effect.fn('film.read.cue')(function* (input) {
    const placed = yield* placeFilm(yield* (yield* FilmRepo).load(input.film));
    const resolved = cueOf(placed, input.scene, input.cue);
    yield* printLine(
      CueRead.make(
        Option.match(resolved, { onNone: () => ({}), onSome: (r) => ({ resolved: r }) }),
      ),
    );
  }),
).pipe(
  Command.withDescription(
    "A cue on its scene's clock as the scene file declares it, as one line of JSON (none when its timeline does not resolve)",
  ),
);

/** `film read`, run fresh by the lab. */
export const read = Command.make('read').pipe(
  Command.withDescription(
    'What the lab reads of a film, fresh from disk, as one line of JSON (the lab runs these)',
  ),
  Command.withSubcommands([voice, cue]),
);
