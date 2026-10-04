// `film options`: a film's choice points read, a mix of one variant made, a
// library take kept, unkept or rejected, and a beat's attempt kept, in this
// process, as the film's sources stand on disk. The review runs these in a
// fresh process (`FreshFilm`, `fresh-film.ts`) because its own imports of the
// film and the app's sound library are as they were at its start. Each prints
// one line of JSON (`FreshLine`) on stdout: its answer, or the failure it
// ended with (`answering`: a refusal as itself, any other as ServerFailed);
// logs go to stderr.
//
//   film options list <film> [--check]
//       the film's choice points (`choice-points.ts`): score, looks, takes,
//       voices, levels, each with the owner's approvals and comments; with
//       --check, the static check of the same sources beside them
//   film options mix <film> --point <id> --variant <id> --to <file.m4a>
//       the film's whole mix with that variant in place (a score option, a
//       take at every placement of its sound), written as an m4a
//   film options take <film> --point take:<sound> --variant <sha256> --verb pick|unpick|reject
//       the take kept, unkept or rejected through the library, as it stands
//   film options keep-voice <film> <beat> <file> [--accept-mismatch]
//       the beat's attempt `file` kept as its take (one that says something
//       else only with --accept-mismatch), and the track remixed

import { Effect, FileSystem, Match, Option, Path, Result } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { ChoiceVerb } from '../core/choice.ts';
import { PointRef } from '../core/point.ts';
import { hashText } from '../core/narration.ts';
import { RenderCatalogue } from './catalogue.ts';
import { type BeatAttempts, filmPoints } from './choice-points.ts';
import { offered, verbFits } from './choices.ts';
import { VerbRefused } from '../core/refusals.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { staticLeg } from './film-check.ts';
import { lineOf, report } from './findings.ts';
import {
  OptionsChecked,
  OptionsKept,
  OptionsListed,
  OptionsMixed,
  OptionsTaken,
  answering,
  printLine,
} from './fresh-film.ts';
import { SoundLibrary } from './library.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { beatsOf, voicedOf } from './narrator.ts';
import { Takes } from './takes.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** Each beat's attempts, and the hash of its line as it reads now. */
const beatAttempts = Effect.fn('film.options.beats')(function* (loaded: LoadedFilm) {
  const takes = yield* Takes;
  const beats = yield* Effect.fromResult(beatsOf(loaded));
  return yield* Effect.forEach(beats, (beat) =>
    Effect.map(takes.attempts(loaded.paths, beat.id), (attempts): BeatAttempts => ({
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

/** `film check --static --allow-stale` of the loaded film, as the lab and review show it. */
const staticLines = Effect.fn('film.options.static')(function* (loaded: LoadedFilm) {
  const found = yield* staticLeg(loaded, yield* placeFilm(loaded));
  return report(found, { allowStale: true }).findings.map(lineOf);
});

const list = Command.make(
  'list',
  {
    film,
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'also answer the static check of the same sources (what a write answers)',
      ),
    ),
  },
  Effect.fn('film.options.list')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const points = yield* pointsOf(loaded);
    if (!input.check) return yield* printLine(OptionsListed.make({ points }));
    yield* printLine(OptionsChecked.make({ points, findings: yield* staticLines(loaded) }));
  }, answering),
).pipe(
  Command.withDescription(
    "The film's choice points as its sources stand (and, with --check, its static check), as one line of JSON",
  ),
);

const take = Command.make(
  'take',
  {
    film,
    point: Flag.String('point').pipe(Flag.withDescription('the take point: take:<sound>')),
    variant: Flag.String('variant').pipe(Flag.withDescription('the take, by its sha256')),
    verb: Flag.Literals('verb', ChoiceVerb.literals).pipe(
      Flag.withDescription('pick keeps it, unpick unkeeps it, reject rejects it'),
    ),
  },
  Effect.fn('film.options.take')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    // The take and the verb are checked against the film and its library as they stand.
    const found = Result.flatMap(
      offered(input.film, yield* pointsOf(loaded), input.point, input.variant),
      (at) => Result.map(verbFits(at.point, at.variant, input.verb), () => at),
    );
    if (Result.isFailure(found)) return yield* found.failure;
    const { point, variant } = found.success;
    const { ref } = point;
    if (!PointRef.guards.Take(ref))
      return yield* VerbRefused.make({
        point: point.id,
        variant: variant.id,
        verb: input.verb,
        reason: `a ${point.kind} is not a library take`,
      });
    const library = yield* SoundLibrary;
    const { sound } = ref;
    yield* Match.value(input.verb).pipe(
      Match.when('pick', () => library.keep(sound, [variant.id])),
      Match.when('unpick', () => library.unkeep(sound, [variant.id])),
      Match.orElse(() => library.reject(sound, [variant.id])),
    );
    yield* printLine(OptionsTaken.make({}));
  }, answering),
).pipe(Command.withDescription("Keep, unkeep or reject one of a sound's takes, by its sha256"));

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
    const found = offered(input.film, yield* pointsOf(loaded), input.point, input.variant);
    if (Result.isFailure(found)) return yield* found.failure;
    const { point, variant } = found.success;
    const ref = Option.some(point.ref);
    const score = Option.filter(ref, PointRef.guards.Score);
    const take = Option.map(Option.filter(ref, PointRef.guards.Take), (r) => ({
      sound: r.sound,
      take: variant.id,
    }));
    if (Option.isNone(score) && Option.isNone(take))
      return yield* VerbRefused.make({
        point: point.id,
        variant: variant.id,
        verb: 'hear in place',
        reason: `a ${point.kind} is not heard in the mix`,
      });
    const { mixed } = yield* (yield* Mixer).render(input.film, {
      warn: false,
      score: Option.as(score, variant.id),
      take,
    });
    yield* (yield* Media).writeAac(input.to, mixed.master);
    yield* printLine(OptionsMixed.make({}));
  }, answering),
).pipe(Command.withDescription("The film's whole mix with one variant in place, as an m4a"));

const keepVoice = Command.make(
  'keep-voice',
  {
    film,
    beat: Argument.String('beat').pipe(Argument.withDescription('the beat, a scene id')),
    file: Argument.String('file').pipe(
      Argument.withDescription('the attempt to keep, as its beat lists it'),
    ),
    acceptMismatch: Flag.Boolean('accept-mismatch').pipe(
      Flag.withDefault(false),
      Flag.withDescription('keep it even when its transcript does not match its line'),
    ),
  },
  Effect.fn('film.options.keepVoice')(function* (input) {
    const voiced = yield* Effect.fromResult(voicedOf(yield* (yield* FilmRepo).load(input.film)));
    const kept = yield* (yield* Takes).keepAttempt(voiced, input.beat, input.file, {
      acceptMismatch: input.acceptMismatch,
    });
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
    yield* printLine(
      OptionsKept.make({ take: kept.take, heard: kept.heard, wer: kept.wer, mixed }),
    );
  }, answering),
).pipe(Command.withDescription("Keep a beat's attempt as its take, and remix the track"));

export const options = Command.make('options').pipe(
  Command.withDescription(
    "A film's choices, their mixes, a take or a voice kept, read fresh from disk (what the lab's review asks)",
  ),
  Command.withSubcommands([list, mix, take, keepVoice]),
);
