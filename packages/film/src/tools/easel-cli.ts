// `film look`: a still of a scene as its sources stand, from the lab's warm
// page, in about a second, with no render. A thin client of the lab's look
// route (`POST /api/films/<film>/looks`, `LooksGroup` in core/api.ts): the
// lab at `FILM_LAB_URL` (the always-on one, http://127.0.0.1:8229/, unless
// set) draws and writes each still under `out/<film>/look/<scene>/`, and this
// prints one line per still, its file first (`lookLine`), or the lab's whole
// answer as one JSON line (`--json`). No lab answering is `LabDown`: the
// look draws nothing rather than start a browser of its own.
//
//   film look <film> --scene <id> --at <place> [--at <place> ...]
//       [--crop x0,y0,x1,y1] [--size <long side>] [--mode plain|value|squint]
//       [--captions] [--format png|jpeg] [--level <look>=<level> ...] [--json]
//
// `--level` draws a wedge: the look at that level in place of the one the
// film plays, its pick unwritten (`tools/easel.ts`).
//
// `film match`: a scene's figures at one place held against their concepts,
// through the lab's match route (`POST /api/films/<film>/matches`,
// `MatchesGroup`) with a look's guarantees: per figure its table and its
// side-by-side, written under `out/<film>/match/<scene>/`, printed as their
// files and the rows past tolerance (`matchLines`), or as one JSON line.
//
//   film match <film> --scene <id> --at <place> [--figure <name>] [--json]
//
// `film critique`: the same match, then each figure's two crops shown at 1:1
// to a fresh model beside the match's flagged rows and the app's figure rules
// (`Critic`, `tools/critique.ts`): its findings written beside each table
// (`<stem>.critique.md`) and printed, a skip said and never a failure.
//
//   film critique <film> --scene <id> --at <place> [--figure <name>] [--json]

import { Argument, Command, Flag } from 'effect/cli';
import { Array as Arr, Console, Effect, Layer, Option, Path, Result, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { LabHttpApi, ToolFailure } from '../core/api.ts';
import {
  LOOK_MAX_SIZE,
  LabDown,
  LookInvalid,
  LookMode,
  LookPost,
  LookTaken,
  type StillView,
  ToolFailed,
  cropOf,
  formatFor,
  levelsOf,
  lookLine,
} from '../core/easel.ts';
import type { CritiqueRule } from '../core/critique.ts';
import { MatchPost, MatchTaken, matchLines } from '../core/match.ts';
import { Counsel } from './counsel.ts';
import { Critic, CritiqueTaken } from './critique.ts';
import { labUrl } from './lab-client.ts';

const FORMATS = { png: 'image/png', jpeg: 'image/jpeg' } as const;

/** The lab's answer as one JSON line (`--json`). */
const takenJson = Schema.encodeSync(Schema.fromJsonString(LookTaken));

const encodeFailure = Schema.encodeUnknownOption(Schema.fromJsonString(ToolFailure));

/**
 * A failure as `--json` prints it, one JSON line in the one shape a tool
 * decodes (`ToolFailure`): a route's refusal exactly as the route answered
 * it, a tool's own as itself, and any other as `ToolFailed` (its tag and
 * its words).
 */
export const failureJson = (error: { readonly _tag: string; readonly message: string }): string =>
  Option.getOrElse(encodeFailure(error), () =>
    Option.getOrElse(
      encodeFailure(ToolFailed.make({ failed: error._tag, reason: error.message })),
      () => '',
    ),
  );

/** A look as it will be sent, or why it cannot be: a request the route would refuse unread. */
const sendable = (post: LookPost) =>
  Schema.encodeEffect(LookPost)(post).pipe(
    Effect.mapError((error) => LookInvalid.make({ reason: error.message })),
  );

/**
 * The look `post` of `film` asked of the lab at `url` (`LooksGroup`): the
 * stills it wrote and their build, its refusal as itself, `LookInvalid` when
 * the request cannot be sent at all (no lab is asked), or `LabDown` when no
 * lab answered, or one answered with no look (a lab older than the asker).
 */
export const takeLook = (url: string, film: string, post: LookPost) =>
  sendable(post).pipe(
    Effect.andThen(HttpApiClient.make(LabHttpApi, { baseUrl: url })),
    Effect.flatMap((client) => client.looks.take({ params: { film }, payload: post })),
    Effect.catchTags({
      HttpClientError: (error) => Effect.fail(LabDown.make({ url, reason: error.message })),
      SchemaError: (error) =>
        Effect.fail(
          LabDown.make({
            url,
            reason: `it answered no look (${error.message}); a lab older than this checkout needs a restart`,
          }),
        ),
    }),
  );

/** `film look`, its films folder `films` sent so a lab serving another checkout refuses. */
export const look = (films: string) =>
  Command.make(
    'look',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film, a folder under src/films'),
      ),
      scene: Flag.String('scene').pipe(Flag.withDescription('the scene, by its id')),
      at: Flag.String('at').pipe(
        Flag.atLeast(1),
        Flag.withDescription(
          "where in the scene: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>] (a share of the cue, 0 its start); repeat for more stills",
        ),
      ),
      crop: Flag.String('crop').pipe(
        Flag.optional,
        Flag.withDescription('x0,y0,x1,y1 in canvas pixels: that region, shown at 1:1'),
      ),
      size: Flag.Int('size').pipe(
        Flag.optional,
        Flag.withDescription(`the still's long side in pixels (16 to ${LOOK_MAX_SIZE})`),
      ),
      mode: Flag.Literals('mode', LookMode.literals).pipe(
        Flag.withDefault('plain'),
        Flag.withDescription(
          'plain; value (greys: the light and dark as values); squint (greys, blurred: the big masses)',
        ),
      ),
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(false),
        Flag.withDescription('burn the captions in'),
      ),
      format: Flag.Literals('format', ['png', 'jpeg']).pipe(
        Flag.optional,
        Flag.withDescription(
          'png (lossless) or jpeg (0.95); unless told, a crop is png and a whole frame jpeg (a whole frame as png is about 4 MB)',
        ),
      ),
      level: Flag.String('level').pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          "look=level: draw that look (palette.ts's looks) at that level, not the one it plays, the pick unwritten (a wedge); repeat for more looks",
        ),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "print the lab's answer as one JSON line (a failure as the route answers it: ToolFailure in core/api.ts)",
        ),
      ),
    },
    Effect.fn('film.look')(
      function* (input) {
        const url = yield* labUrl;
        const path = yield* Path.Path;
        const crop = yield* Option.match(input.crop, {
          onNone: () => Effect.succeedNone,
          onSome: (text) =>
            Result.match(cropOf(text), { onFailure: Effect.fail, onSuccess: Effect.succeedSome }),
        });
        const view: StillView = {
          ...Option.match(crop, { onNone: () => ({}), onSome: (c) => ({ crop: c }) }),
          ...Option.match(input.size, { onNone: () => ({}), onSome: (s) => ({ size: s }) }),
          mode: input.mode,
          captions: input.captions,
          format: Option.match(input.format, {
            onNone: () => formatFor(Option.isSome(crop)),
            onSome: (f) => FORMATS[f],
          }),
        };
        const at = yield* Option.match(Arr.head(input.at), {
          onNone: () =>
            Effect.fail(LookInvalid.make({ reason: 'no --at: say where in the scene' })),
          onSome: (first) => Effect.succeed(Arr.prepend(Arr.drop(input.at, 1), first)),
        });
        const levels = yield* Effect.fromResult(levelsOf(input.level));
        const post: LookPost = { scene: input.scene, at, view, from: path.resolve(films), levels };
        const taken = yield* takeLook(url, input.film, post);
        if (input.json) return yield* Console.log(takenJson(taken));
        for (const one of taken.looks) yield* Console.log(lookLine(one, taken.build));
      },
      (effect, input) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureJson(error)), Effect.succeed(input.json)),
        ),
    ),
  ).pipe(
    Command.provide(FetchHttpClient.layer),
    Command.withDescription(
      "Look at a scene as its sources stand: stills from the lab's warm page (FILM_LAB_URL, else the always-on lab), in about a second, with no render; one line per still, its file first",
    ),
  );

/** A match's answer as one JSON line (`--json`). */
const matchedJson = Schema.encodeSync(Schema.fromJsonString(MatchTaken));

/**
 * The match `post` of `film` asked of the lab at `url` (`MatchesGroup`):
 * each figure's table and side-by-side, its refusal as itself, `LookInvalid`
 * when the request cannot be sent, or `LabDown` when no lab answered, or one
 * answered with no match (a lab older than the asker).
 */
export const takeMatch = (url: string, film: string, post: MatchPost) =>
  Schema.encodeEffect(MatchPost)(post).pipe(
    Effect.mapError((error) => LookInvalid.make({ reason: error.message })),
    Effect.andThen(HttpApiClient.make(LabHttpApi, { baseUrl: url })),
    Effect.flatMap((client) => client.matches.take({ params: { film }, payload: post })),
    Effect.catchTags({
      HttpClientError: (error) => Effect.fail(LabDown.make({ url, reason: error.message })),
      SchemaError: (error) =>
        Effect.fail(
          LabDown.make({
            url,
            reason: `it answered no match (${error.message}); a lab older than this checkout needs a restart`,
          }),
        ),
    }),
  );

/** `film match`, its films folder `films` sent so a lab serving another checkout refuses. */
export const match = (films: string) =>
  Command.make(
    'match',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film, a folder under src/films'),
      ),
      scene: Flag.String('scene').pipe(Flag.withDescription('the scene, by its id')),
      at: Flag.String('at').pipe(
        Flag.withDescription(
          "where in the scene: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>]",
        ),
      ),
      figure: Flag.String('figure').pipe(
        Flag.optional,
        Flag.withDescription(
          "one figure, by its rig's name (lead) or key; every figure with a concept when left out",
        ),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "print the lab's answer as one JSON line (a failure as the route answers it: ToolFailure in core/api.ts)",
        ),
      ),
    },
    Effect.fn('film.match')(
      function* (input) {
        const url = yield* labUrl;
        const path = yield* Path.Path;
        const post: MatchPost = {
          scene: input.scene,
          at: input.at,
          ...Option.match(input.figure, { onNone: () => ({}), onSome: (figure) => ({ figure }) }),
          from: path.resolve(films),
        };
        const taken = yield* takeMatch(url, input.film, post);
        if (input.json) return yield* Console.log(matchedJson(taken));
        yield* Console.log(
          `match scene=${taken.scene} at=${taken.at} t=${taken.time.toFixed(2)} frame=${taken.frame} build=${taken.build}`,
        );
        for (const one of taken.figures)
          for (const line of matchLines(one)) yield* Console.log(line);
        for (const one of taken.unmatched)
          yield* Console.log(`${one.figure}: unmatched (${one.reason})`);
      },
      (effect, input) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureJson(error)), Effect.succeed(input.json)),
        ),
    ),
  ).pipe(
    Command.provide(FetchHttpClient.layer),
    Command.withDescription(
      "Hold a scene's figures against their concepts at one place: per figure a table of ratios and shading (flagged past 5%) and a side-by-side at one head height, from the lab's warm page; not a gate",
    ),
  );

/** A critique's answer as one JSON line (`--json`). */
const critiquedJson = Schema.encodeSync(Schema.fromJsonString(CritiqueTaken));

/** `film critique`, over the app's figure rules `rules` (`FilmApp.critique`), its films folder `films` sent as `match` sends it. */
export const critique = (films: string, rules: ReadonlyArray<CritiqueRule>) =>
  Command.make(
    'critique',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film, a folder under src/films'),
      ),
      scene: Flag.String('scene').pipe(Flag.withDescription('the scene, by its id')),
      at: Flag.String('at').pipe(
        Flag.withDescription(
          "where in the scene: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>]",
        ),
      ),
      figure: Flag.String('figure').pipe(
        Flag.optional,
        Flag.withDescription(
          "one figure, by its rig's name (lead) or key; every figure with a concept when left out",
        ),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription("print the critique's answer as one JSON line"),
      ),
    },
    Effect.fn('film.critique')(
      function* (input) {
        const url = yield* labUrl;
        const path = yield* Path.Path;
        const taken = yield* takeMatch(url, input.film, {
          scene: input.scene,
          at: input.at,
          ...Option.match(input.figure, { onNone: () => ({}), onSome: (figure) => ({ figure }) }),
          from: path.resolve(films),
        });
        const critiqued = yield* (yield* Critic).critique(taken);
        if (input.json) return yield* Console.log(critiquedJson(critiqued));
        yield* Console.log(
          `critique scene=${taken.scene} at=${taken.at} build=${taken.build} cached=${critiqued.cached}${Option.match(Option.fromUndefinedOr(critiqued.skipped), { onNone: () => '', onSome: (why) => ` skipped="${why}"` })}`,
        );
        for (const one of critiqued.figures) {
          yield* Console.log(`${one.figure}: ${one.file}`);
          for (const f of one.findings) yield* Console.log(`  ${f.aspect}: ${f.what}`);
        }
        for (const why of critiqued.rejected) yield* Console.log(`rejected: ${why}`);
        for (const one of taken.unmatched)
          yield* Console.log(`${one.figure}: unmatched (${one.reason})`);
      },
      (effect, input) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureJson(error)), Effect.succeed(input.json)),
        ),
    ),
  ).pipe(
    Command.provide(
      Layer.mergeAll(FetchHttpClient.layer, Critic.layer(rules).pipe(Layer.provide(Counsel.layer))),
    ),
    Command.withDescription(
      "Match a scene's figures at one place, then show each figure's concept and scene crops at 1:1 to a fresh Opus (headless Claude, sandboxed) beside the flagged rows and the app's figure rules: differences in head angle and turn, face, pose, proportion, palette and artifacts, written beside the match (<stem>.critique.md); batched, kept by the hash of its prompt and crops; a finding that does not read, or names no figure asked about, printed as rejected; a skip (logged) when the counsel fails or dies",
    ),
  );
