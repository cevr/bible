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
//       [--captions] [--format png|jpeg] [--json]

import { Argument, Command, Flag } from 'effect/cli';
import { Array as Arr, Config, Console, Effect, Option, Path, Result, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import {
  LOOK_MAX_SIZE,
  LabDown,
  LookInvalid,
  LookMode,
  type LookPost,
  LookTaken,
  type StillView,
  cropOf,
  formatFor,
  lookLine,
} from '../core/easel.ts';

/** The lab a look asks: the always-on one unless `FILM_LAB_URL` names another (a spare lab's port). */
const labUrl = Config.String('FILM_LAB_URL').pipe(Config.withDefault('http://127.0.0.1:8229/'));

const FORMATS = { png: 'image/png', jpeg: 'image/jpeg' } as const;

/** A value as one JSON line. */
const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
/** The lab's answer as one JSON line (`--json`). */
const takenJson = Schema.encodeSync(Schema.fromJsonString(LookTaken));

/** A failure as `--json` prints it: its tag, its message and its fields. */
const failureJson = (error: { readonly _tag: string; readonly message: string }) =>
  jsonOf({ error: { ...error, _tag: error._tag, message: error.message } });

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
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription("print the lab's answer as one JSON line (a failure as {error})"),
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
        const post: LookPost = { scene: input.scene, at, view, from: path.resolve(films) };
        const taken = yield* HttpApiClient.make(LabHttpApi, { baseUrl: url }).pipe(
          Effect.flatMap((client) =>
            client.looks.take({ params: { film: input.film }, payload: post }),
          ),
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
