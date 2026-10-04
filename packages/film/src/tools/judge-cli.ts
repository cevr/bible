// `film judge`: a blind second opinion on one picture choice at one scene
// (`tools/judge.ts`). It draws each version's stills (a look's levels through
// the lab's easel at FILM_LAB_URL, a render set's variants from their
// videos), sends the packet to `okra counsel --deep`, and prints a few short
// lines: the verdict's path, the ranking in real names beside the owner's
// pick, and the counsel's answer's path; or one JSON line (`--json`). The
// packet never comes back in what it prints. It writes no choice.
//
//   film judge <film> --scene <id> [--point <choice point>] [--captions] [--json]

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, Layer, Option, Path, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { type JudgeRule, pickOf, rankingLine } from '../core/judge.ts';
import { Counsel } from './counsel.ts';
import { failureJson, labUrl, takeLook } from './easel-cli.ts';
import { filmNamed } from './film-repo.ts';
import { judge as judgeScene } from './judge.ts';

/** A value as one JSON line. */
const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** `film judge` over the films in `films`, quoting the app's `rules`. */
export const judge = (films: string, rules: ReadonlyArray<JudgeRule>) =>
  Command.make(
    'judge',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film, a folder under src/films'),
      ),
      scene: Flag.String('scene').pipe(Flag.withDescription('the scene, by its id')),
      point: Flag.String('point').pipe(
        Flag.optional,
        Flag.withDescription(
          "the choice to judge: look:<name> (its levels) or render:<address> (its variants); unless named, the scene's one picture choice with two versions or more",
        ),
      ),
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(false),
        Flag.withDescription('burn the captions into every still'),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print the verdict as one JSON line (a failure as {error})'),
      ),
    },
    Effect.fn('film.judge')(
      function* (input) {
        const url = yield* labUrl;
        const path = yield* Path.Path;
        const film = yield* filmNamed(input.film);
        const from = path.resolve(films);
        const judged = yield* judgeScene({
          film,
          scene: input.scene,
          point: input.point,
          captions: input.captions,
          rules,
          take: (post) => takeLook(url, film, { ...post, from }),
        });
        const ranking = rankingLine(judged.key, judged.ranking);
        const pick = Option.match(pickOf(judged.key), {
          onNone: () => 'none',
          onSome: (v) => v.version,
        });
        if (input.json)
          return yield* Console.log(
            jsonOf({
              verdict: judged.verdict,
              point: judged.key.point,
              ranking,
              pick,
              versions: judged.key.versions.map((v) => ({ label: v.label, version: v.version })),
              counsel: judged.counsel,
            }),
          );
        yield* Console.log(`verdict ${judged.verdict}`);
        yield* Console.log(`ranking ${ranking} (point=${judged.key.point} pick=${pick})`);
        yield* Console.log(`counsel ${judged.counsel}`);
      },
      (effect, input) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureJson(error)), Effect.succeed(input.json)),
        ),
    ),
  ).pipe(
    Command.provide(Layer.mergeAll(FetchHttpClient.layer, Counsel.layer)),
    Command.withDescription(
      "A blind second opinion on one picture choice at a scene: each version's stills at the same moments (a look's levels drawn through the lab's easel, a render set's variants from their videos), labelled at random, ranked against the film's rules by okra counsel --deep; prints the verdict's path and the ranking. Writes no choice",
    ),
  );
