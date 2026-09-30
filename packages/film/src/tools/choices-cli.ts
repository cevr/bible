// `film options`: a film's choice points read, a mix of one variant made, and
// a beat's attempt kept, in this process, as the film's sources stand on
// disk. The review runs these in a fresh process (`FreshFilm`,
// `choices-process.ts`) because its own imports of the film are as they were
// at its start. Each prints one line of JSON (`FreshLine`) on stdout: its
// answer, or the refusal it failed with; logs go to stderr.
//
//   film options list <film>
//       the film's choice points (`choice-points.ts`): score, looks, takes,
//       voices, levels, each with the owner's approvals and comments
//   film options mix <film> --point <id> --variant <id> --to <file.m4a>
//       the film's whole mix with that variant in place (a score option, a
//       take at every placement of its sound), written as an m4a
//   film options keep-voice <film> <beat> <file>
//       the beat's attempt `file` kept as its take, and the track remixed

import { Effect, FileSystem, Option, Path, Result } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { pointName } from '../core/choice.ts';
import { hashText } from '../core/narration.ts';
import { RenderCatalogue } from './catalogue.ts';
import { type BeatAttempts, filmPoints } from './choice-points.ts';
import {
  OptionsKept,
  OptionsListed,
  OptionsMixed,
  answering,
  printLine,
  refuseWith,
} from './choices-process.ts';
import { offered } from './choices.ts';
import { VerbRefused } from './errors.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { beatsOf } from './narrator.ts';
import { Takes } from './takes.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** Each beat's attempts, and the hash of its line as it reads now. */
const beatAttempts = Effect.fn('film.options.beats')(function* (loaded: LoadedFilm) {
  const takes = yield* Takes;
  const beats = yield* Effect.fromResult(beatsOf(loaded));
  return yield* Effect.forEach(beats, (beat) =>
    Effect.map(takes.attempts(loaded, beat.id), (attempts): BeatAttempts => ({
      beat: beat.id,
      hash: hashText(beat.script),
      attempts,
    })),
  );
});

/** `sound.ts` beside the film: its path and text, when it has one. */
const soundSource = Effect.fn('film.options.soundSource')(function* (loaded: LoadedFilm) {
  const fs = yield* FileSystem.FileSystem;
  const file = (yield* Path.Path).join(loaded.paths.dir, 'sound.ts');
  if (!(yield* fs.exists(file))) return Option.none();
  return Option.some({ file, text: yield* fs.readFileString(file) });
});

/** The film's choice points as its sources stand, with the catalogue's say on each variant. */
const pointsOf = Effect.fn('film.options.points')(function* (loaded: LoadedFilm) {
  return filmPoints({
    loaded,
    placed: yield* placeFilm(loaded),
    soundSource: yield* soundSource(loaded),
    beats: yield* beatAttempts(loaded),
    catalogue: Option.some(yield* (yield* RenderCatalogue).read(loaded.paths)),
  });
});

const list = Command.make(
  'list',
  { film },
  Effect.fn('film.options.list')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(OptionsListed.make({ points: yield* answering(pointsOf(loaded)) }));
  }),
).pipe(
  Command.withDescription("The film's choice points as its sources stand, as one line of JSON"),
);

const mix = Command.make(
  'mix',
  {
    film,
    point: Flag.String('point').pipe(Flag.withDescription('the choice point: score, take:<sound>')),
    variant: Flag.String('variant').pipe(
      Flag.withDescription('the variant to play: a score option, a take sha256'),
    ),
    to: Flag.String('to').pipe(Flag.withDescription('the m4a to write')),
  },
  Effect.fn('film.options.mix')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    // The point and variant are checked against the film as it stands before a mix is rendered.
    const found = offered(
      input.film,
      yield* answering(pointsOf(loaded)),
      input.point,
      input.variant,
    );
    if (Result.isFailure(found)) return yield* refuseWith(found.failure);
    const { point, variant } = found.success;
    if (point.kind !== 'score' && point.kind !== 'take')
      return yield* refuseWith(
        VerbRefused.make({
          point: point.id,
          variant: variant.id,
          verb: 'hear in place',
          reason: `a ${point.kind} is not heard in the mix`,
        }),
      );
    const { mixed } = yield* (yield* Mixer).render(input.film, {
      warn: false,
      score: Option.liftPredicate(variant.id, () => point.kind === 'score'),
      take: Option.liftPredicate(
        { sound: pointName(point), take: variant.id },
        () => point.kind === 'take',
      ),
    });
    yield* (yield* Media).writeAac(input.to, mixed.master);
    yield* printLine(OptionsMixed.make({}));
  }),
).pipe(Command.withDescription("The film's whole mix with one variant in place, as an m4a"));

const keepVoice = Command.make(
  'keep-voice',
  {
    film,
    beat: Argument.String('beat').pipe(Argument.withDescription('the beat, a scene id')),
    file: Argument.String('file').pipe(
      Argument.withDescription('the attempt to keep, as its beat lists it'),
    ),
  },
  Effect.fn('film.options.keepVoice')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* answering(
      (yield* Takes).keepAttempt(loaded, input.beat, input.file, { acceptMismatch: false }),
    );
    // The track is remixed with the take; a failed mix leaves the take kept and says why.
    const mixed = yield* (yield* Mixer)
      .mix(input.film, { stems: false, score: Option.none() })
      .pipe(
        Effect.as(true),
        Effect.catch((error) =>
          Effect.logWarning(
            `options.keep-voice.mix.failed film=${input.film} tag=${error._tag} reason=${error.message}`,
          ).pipe(Effect.as(false)),
        ),
      );
    yield* printLine(OptionsKept.make({ mixed }));
  }),
).pipe(Command.withDescription("Keep a beat's attempt as its take, and remix the track"));

export const options = Command.make('options').pipe(
  Command.withDescription(
    "A film's choices, their mixes and a voice kept, read fresh from disk (what `film review` asks)",
  ),
  Command.withSubcommands([list, mix, keepVoice]),
);
