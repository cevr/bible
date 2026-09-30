// `film options`: a film's choices read, and a mix of one made, in this
// process, as its sources stand on disk. The review runs these in a fresh
// process (`FreshFilm`, `choices-process.ts`) because its own imports of the
// film are as they were at its start. Each prints one line of JSON
// (`OptionsLine`) on stdout; logs go to stderr.
//
//   film options list <film>
//       the film's choice points: its score's options, the library sounds it places
//   film options mix <film> [--score option] [--take sound:sha256] --to <file.m4a>
//       the film's whole mix with that option, or that take at every placement
//       of its sound, written as an m4a

import { Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  OptionsListed,
  OptionsMixed,
  type OptionsLine,
  OptionsLineJson,
} from './choices-process.ts';
import { filmChoices, offeredOption, offeredTake } from './choices.ts';
import { type ChoiceUnknown, type TakeUnknown } from './errors.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { Mixer, type TakeInPlace } from './mixer.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

const encodeLine = Schema.encodeEffect(OptionsLineJson);

/** Print `line`, the command's answer, as one line of JSON. */
const answer = (line: OptionsLine) => Effect.flatMap(encodeLine(line), Console.log);

/** Print a choice the film lacks as the answer, then fail with it (exit 1). */
const refuse = (error: ChoiceUnknown | TakeUnknown) =>
  Effect.andThen(answer(error), Effect.fail(error));

/** `sound:sha256` as a take in place, or the text as given when it has no colon. */
const takeIn = (given: string): TakeInPlace => {
  const at = given.lastIndexOf(':');
  return { sound: given.slice(0, Math.max(0, at)), take: given.slice(at + 1) };
};

const list = Command.make(
  'list',
  { film },
  Effect.fn('film.options.list')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const choices = filmChoices(loaded, yield* placeFilm(loaded));
    yield* answer(OptionsListed.make({ choices }));
  }),
).pipe(Command.withDescription("The film's choices as its sources stand, as one line of JSON"));

const mix = Command.make(
  'mix',
  {
    film,
    score: Flag.String('score').pipe(
      Flag.optional,
      Flag.withDescription('play this score option in place of the one the score names'),
    ),
    take: Flag.String('take').pipe(
      Flag.optional,
      Flag.withDescription('play this take (sound:sha256) at every placement of its sound'),
    ),
    to: Flag.String('to').pipe(Flag.withDescription('the m4a to write')),
  },
  Effect.fn('film.options.mix')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const choices = filmChoices(loaded, yield* placeFilm(loaded));
    const take = Option.map(input.take, takeIn);
    // The option or take is checked against the film as it stands before a mix is rendered.
    for (const option of Option.toArray(input.score)) {
      const offered = offeredOption(input.film, choices, option);
      if (offered._tag === 'Failure') return yield* refuse(offered.failure);
    }
    for (const t of Option.toArray(take)) {
      const offered = offeredTake(input.film, choices, t.sound, t.take);
      if (offered._tag === 'Failure') return yield* refuse(offered.failure);
    }
    const { mixed } = yield* (yield* Mixer).render(input.film, {
      warn: false,
      score: input.score,
      take,
    });
    yield* (yield* Media).writeAac(input.to, mixed.master);
    yield* answer(OptionsMixed.make({}));
  }),
).pipe(Command.withDescription("The film's whole mix with one option or take in place, as an m4a"));

export const options = Command.make('options').pipe(
  Command.withDescription(
    "A film's choices and their mixes, read fresh from disk (what `film review` asks)",
  ),
  Command.withSubcommands([list, mix]),
);
