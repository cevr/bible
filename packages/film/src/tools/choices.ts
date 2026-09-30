// A film's choices: the options it is choosing between, each heard in place,
// and the pick written back where the film declares it.
//
// - A score's options (`sound.ts`'s `score.options`): each heard as the whole
//   film's mix with that option playing, against the film's latest render. A
//   pick sets `play`: the one string in `sound.ts`, spliced by the parser
//   (`sound-source.ts`) through the SourceWriter.
// - A library sound's takes (`library.lock.json`): each heard alone (its
//   file) and in place (the whole mix with that take at every placement of
//   the sound). A take is kept, unkept or rejected by its sha256 through the
//   library's own operations (`SoundLibrary.keep`/`unkeep`/`reject`),
//   recorded around the lock's rewrite by the SourceWriter, so it is undone
//   the same way.
//
// The review runs for days and its own imports of a film stay as they were at
// start, so the film's options are read, and its mixes made, in a fresh
// process (`FreshFilm`, `choices-process.ts`): every answer is the film as it
// stands on disk. `filmChoices` is what that process lists.
//
// Every mix is derived once into the review's cache, keyed by the film's
// sources as they stand (the newest mtime under its folder and the lock), so a
// change to the film makes it again. A render set (a sketchbook) has no pick
// and is the review's (`review.ts`); a look is not a choice yet.

import {
  Array as Arr,
  Context,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { UnknownSound } from '../core/errors.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import { type MixPlan, mixPlan } from '../core/mix.ts';
import type {
  EffectChoice,
  EffectPlacement,
  EffectTake,
  FilmChoice,
  FilmChoices,
  ReviewVideo,
  ScoreChoice,
  ScoreState,
  SoundEffect,
  TakeAct,
} from '../core/schema.ts';
import {
  type LibraryEntry,
  type LockEntry,
  type SoundSource,
  type Variant,
  pendingOf,
  requestKey,
} from '../core/sfx.ts';
import { type ScoreOptionState, scoreOptionState, scoreOptions } from '../core/sound.ts';
import { FreshFilm } from './choices-process.ts';
import { cacheKey } from './digest.ts';
import {
  ChoiceUnknown,
  type ChoicesProcessFailed,
  type FormatFailed,
  type ReviewToolFailed,
  type SourceRefused,
  TakeActRefused,
  TakeUnknown,
} from './errors.ts';
import { type FilmName, FilmRepo, type LoadedFilm } from './film-repo.ts';
import { type LibraryError, SoundLibrary } from './library.ts';
import type { TakeInPlace } from './mixer.ts';
import { Review } from './review.ts';
import { type Change, type RewriteError, SourceWriter } from './source-writer.ts';
import { editPlay, readPlay } from './sound-source.ts';

/** What a pick did: the change it made (none when it was already so). */
export interface Picked {
  /** The file it rewrote. */
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
}

export type ChoicesError = ChoicesProcessFailed | LibraryError | SourceRefused | PlatformError;

export interface ChoicesService {
  /** The film's choices as they stand, and the renders they are heard against. */
  readonly list: (film: FilmName) => Effect.Effect<FilmChoices, ChoicesError>;
  /** Play `option`: `play` in `sound.ts`. */
  readonly pickScore: (
    film: FilmName,
    option: string,
  ) => Effect.Effect<Picked, ChoicesError | ChoiceUnknown | RewriteError>;
  /** Keep, unkeep or reject a take (by its sha256) of a sound the film plays. */
  readonly curate: (
    film: FilmName,
    sound: string,
    take: string,
    act: TakeAct,
  ) => Effect.Effect<
    Picked,
    ChoicesError | ChoiceUnknown | TakeUnknown | TakeActRefused | UnknownSound | FormatFailed
  >;
  /** The film's whole mix with `option` playing, as an m4a in the review's cache. */
  readonly scoreMix: (
    film: FilmName,
    option: string,
  ) => Effect.Effect<string, ChoicesError | ChoiceUnknown | TakeUnknown | ReviewToolFailed>;
  /** A take's own file. */
  readonly takeAudio: (
    film: FilmName,
    sound: string,
    take: string,
  ) => Effect.Effect<string, ChoicesError | ChoiceUnknown | TakeUnknown>;
  /** The film's whole mix with only this take at each of the sound's placements, as an m4a. */
  readonly takeMix: (
    film: FilmName,
    sound: string,
    take: string,
  ) => Effect.Effect<string, ChoicesError | ChoiceUnknown | TakeUnknown | ReviewToolFailed>;
}

/** The folders under a film's that hold no source of its sound (renders, caches). */
const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

/** How a score option's state reads on the page. */
const STATE: Record<ScoreOptionState['_tag'], ScoreState> = {
  Current: 'current',
  Stale: 'stale',
  Missing: 'missing',
};

/** A lock variant as a take the review lists: kept or waiting, its 1-based index in that list. */
const takeOf = (
  entry: LibraryEntry,
  variant: Variant,
  state: EffectTake['state'],
  index: number,
): EffectTake => ({
  id: variant.sha256,
  state,
  index,
  secs: variant.secs,
  loudest: variant.loudness.momentaryMax,
  made: variant.made,
  current: variant.request === requestKey(entry),
});

/** A sound's takes: the kept ones as they play, then those waiting for the current request. */
const takesOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) => [
  ...Option.match(lock, { onNone: () => [], onSome: (l) => l.variants }).map((v, i) =>
    takeOf(entry, v, 'kept', i + 1),
  ),
  ...pendingOf(entry, lock).map((v, i) => takeOf(entry, v, 'candidate', i + 1)),
];

/** Whether `act` applies to a take in `state`: only a waiting take is kept or rejected. */
const actFits = (act: TakeAct, state: EffectTake['state']) => {
  if (act === 'unkeep') return state === 'kept';
  return state === 'candidate';
};

const ACTED = new Map<TakeAct, string>([
  ['keep', 'kept'],
  ['unkeep', 'unkept'],
  ['reject', 'rejected'],
]);

/** Where each effect placement of the plan falls: its effect, its scene, its film time. */
const placementsOf = (
  film: LoadedFilm,
  plan: Option.Option<MixPlan<SoundSource>>,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<{ readonly sound: string; readonly placement: EffectPlacement }> => {
  const effects = Option.match(film.sound, {
    onNone: () => new Map<string, SoundEffect>(),
    onSome: (s) => new Map(Object.entries(s.effects)),
  });
  /** The scene playing at film second `at` (`sceneAt`, the film's one rule). */
  const sceneOfTime = (at: number) =>
    Option.match(sceneAt(placed, at), { onNone: () => '', onSome: (p) => p.spec.id });
  return Option.match(plan, { onNone: () => [], onSome: (p) => p.effects }).flatMap((e) =>
    Option.match(Option.fromUndefinedOr(effects.get(e.name)), {
      onNone: () => [],
      onSome: (effect) => [
        { sound: effect.sound, placement: { effect: e.name, scene: sceneOfTime(e.at), at: e.at } },
      ],
    }),
  );
};

/** The film's score options, the one `play` names picked, each with its state in the store. */
const scoreChoice = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Option.Option<ScoreChoice> =>
  Option.map(
    Option.flatMap(loaded.sound, (s) => Option.fromUndefinedOr(s.score)),
    (score): ScoreChoice => ({
      _tag: 'ScoreChoice',
      picked: score.play,
      variants: scoreOptions(score).map((option) => ({
        id: option.name,
        styles: option.music.styles,
        movements: option.music.movements,
        state: STATE[scoreOptionState(option, placed, loaded.manifest)._tag],
      })),
    }),
  );

/** The library sounds the film's effects place, with where and their takes; recipes have none. */
const effectChoices = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<EffectChoice> => {
  const plan = Option.flatMap(loaded.sound, () =>
    Result.getSuccess(
      mixPlan({
        film: loaded.paths.name,
        placed,
        sound: loaded.sound,
        manifest: loaded.manifest,
        sounds: loaded.sounds,
        narration: loaded.paths.narration,
        soundDir: loaded.paths.sound,
        play: Option.none(),
      }),
    ),
  );
  const where = placementsOf(loaded, plan, placed);
  const declared = Option.match(loaded.sound, {
    onNone: () => [],
    onSome: (s) => Object.values(s.effects).map((e) => e.sound),
  });
  return Arr.dedupe(declared).flatMap((sound) =>
    Option.match(Option.fromUndefinedOr(loaded.sounds.library[sound]), {
      onNone: () => [],
      onSome: (entry): ReadonlyArray<EffectChoice> => {
        if (entry.kind === 'procedural') return [];
        return [
          {
            _tag: 'EffectChoice',
            sound,
            placements: where.filter((w) => w.sound === sound).map((w) => w.placement),
            takes: takesOf(entry, Option.fromUndefinedOr(loaded.sounds.lock[sound])),
          },
        ];
      },
    }),
  );
};

/** The film's choice points as loaded: its score's options, then the library sounds it places. */
export const filmChoices = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<FilmChoice> => [
  ...Option.toArray(scoreChoice(loaded, placed)),
  ...effectChoices(loaded, placed),
];

/** The score option `option` among `choices`, or `ChoiceUnknown` naming the ones there are. */
export const offeredOption = (
  film: string,
  choices: ReadonlyArray<FilmChoice>,
  option: string,
): Result.Result<string, ChoiceUnknown> => {
  const known = choices
    .filter((c): c is ScoreChoice => c._tag === 'ScoreChoice')
    .flatMap((c) => c.variants.map((v) => v.id));
  if (known.includes(option)) return Result.succeed(option);
  return Result.fail(ChoiceUnknown.make({ film, kind: 'score option', name: option, known }));
};

/** The take `take` of the library sound `sound` as `choices` offer it, or why not. */
export const offeredTake = (
  film: string,
  choices: ReadonlyArray<FilmChoice>,
  sound: string,
  take: string,
): Result.Result<EffectTake, ChoiceUnknown | TakeUnknown> => {
  const effects = choices.filter((c): c is EffectChoice => c._tag === 'EffectChoice');
  return Option.match(
    Arr.findFirst(effects, (c) => c.sound === sound),
    {
      onNone: () =>
        Result.fail(
          ChoiceUnknown.make({
            film,
            kind: 'sound',
            name: sound,
            known: effects.map((c) => c.sound),
          }),
        ),
      onSome: (choice) =>
        Result.fromOption(
          Arr.findFirst(choice.takes, (t) => t.id === take),
          () => TakeUnknown.make({ sound, take }),
        ),
    },
  );
};

export class Choices extends Context.Service<Choices, ChoicesService>()(
  '@bible/film/tools/Choices',
) {
  static readonly layer = Layer.effect(
    Choices,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* FilmRepo;
      const library = yield* SoundLibrary;
      const writer = yield* SourceWriter;
      const review = yield* Review;
      const fresh = yield* FreshFilm;

      const soundFile = (film: FilmName) => path.join(repo.paths(film).dir, 'sound.ts');

      /** The film's renders under the review's roots, newest first: its folder's, or named for it. */
      const pictures = Effect.fn('Choices.pictures')(function* (film: FilmName) {
        const index = yield* review.index(false);
        const videos = index.folders.flatMap((folder): ReadonlyArray<ReviewVideo> => {
          const named = Arr.last(folder.ref.split('/')).pipe(
            Option.exists((last) => last === film),
          );
          const all = [
            ...folder.videos,
            ...folder.sets.flatMap((s) => s.variants.map((v) => v.video)),
          ];
          if (named) return all;
          return all.filter((v) => v.name.startsWith(`${film}.`) || v.name.startsWith(`${film}-`));
        });
        return Arr.sort(
          Arr.dedupeWith(videos, (a, b) => a.ref === b.ref),
          Order.flip(Order.mapInput(Order.Number, (v: ReviewVideo) => v.mtime)),
        );
      });

      const list = Effect.fn('Choices.list')(function* (film: FilmName) {
        const choices = yield* fresh.choices(film);
        const result: FilmChoices = { film, pictures: yield* pictures(film), choices };
        return result;
      });

      const pickScore = Effect.fn('Choices.pickScore')(function* (film: FilmName, option: string) {
        yield* Effect.fromResult(offeredOption(film, yield* fresh.choices(film), option));
        const file = soundFile(film);
        const target = `score play ${option}`;
        const change = yield* writer.write({
          film,
          scene: Option.none(),
          file,
          target,
          edit: (source) => editPlay(file, source, option),
          verify: (after) =>
            Result.map(readPlay(file, after), (read) =>
              Arr.filter(['play'], () => read !== option),
            ),
          check: () => Effect.void,
        });
        const picked: Picked = {
          file,
          target,
          change: Option.liftPredicate(change, (c) => c.before !== c.after),
        };
        return picked;
      });

      const curate = Effect.fn('Choices.curate')(function* (
        film: FilmName,
        sound: string,
        take: string,
        act: TakeAct,
      ) {
        const offered = yield* Effect.fromResult(
          offeredTake(film, yield* fresh.choices(film), sound, take),
        );
        const acted = Option.getOrElse(Option.fromUndefinedOr(ACTED.get(act)), () => act);
        if (!actFits(act, offered.state))
          return yield* TakeActRefused.make({ sound, take, act: acted, state: offered.state });
        const file = library.paths.lock.file;
        const target = `sound ${sound} ${act} ${take.slice(0, 12)}`;
        const run = Effect.suspend(() => {
          if (act === 'keep') return library.keep(sound, [take]);
          if (act === 'unkeep') return library.unkeep(sound, [take]);
          return library.reject(sound, [take]);
        });
        const [, change] = yield* writer.around(film, file, target, run);
        const picked: Picked = { file, target, change };
        return picked;
      });

      /**
       * What a mix is made from: the newest mtime of any file under the film's
       * folder (its scenes, takes, score and `sound.ts`) and of the library's
       * lock. A change to any of them makes the mix again.
       */
      const stamp = Effect.fn('Choices.stamp')(function* (film: FilmName) {
        const dir = repo.paths(film).dir;
        const files = yield* fs.readDirectory(dir, { recursive: true });
        const sources = files.filter((f) => !NOT_SOURCE.includes(f.split('/')[0] ?? ''));
        const times = yield* Effect.forEach(
          [...sources.map((f) => path.join(dir, f)), library.paths.lock.file],
          (file) =>
            fs.stat(file).pipe(
              Effect.map((info) =>
                Option.match(info.mtime, { onNone: () => 0, onSome: (d) => d.getTime() }),
              ),
              Effect.orElseSucceed(() => 0),
            ),
          { concurrency: 16 },
        );
        return Math.max(0, ...times);
      });

      /** The mix `name` made in a fresh process: the film's with `score` and `take`, as an m4a. */
      const derived = (
        name: string,
        film: FilmName,
        score: Option.Option<string>,
        take: Option.Option<TakeInPlace>,
      ) =>
        review.derive(name, (temporary) =>
          fresh
            .mix(film, score, take, temporary)
            .pipe(Effect.tap(() => Effect.log(`review.mix film=${film} name=${name}`))),
        );

      /**
       * The mixes being made, by name. A mix runs in the service's scope, not
       * the request's: a page that stops waiting (a dropped connection, the
       * next 🔊) leaves it running, and the next ask joins it or finds it made.
       * One mix at a time: each renders the whole film.
       */
      const running = new Map<
        string,
        Fiber.Fiber<string, Effect.Error<ReturnType<typeof derived>>>
      >();
      const oneMix = Semaphore.makeUnsafe(1);
      const scope = yield* Scope.Scope;

      /**
       * The film's mix with `score` and `take` as asked, derived once into the
       * cache as an m4a. The fresh process checks the option or take is the
       * film's: a name it lacks is answered as unknown, and nothing is cached.
       */
      const mixed = (
        film: FilmName,
        score: Option.Option<string>,
        take: Option.Option<TakeInPlace>,
      ) =>
        Effect.gen(function* () {
          const key = cacheKey([
            film,
            Option.getOrElse(score, () => ''),
            ...Option.match(take, { onNone: () => [], onSome: (t) => [t.sound, t.take] }),
            yield* stamp(film),
          ]);
          const name = `mix/${film}/${key}.m4a`;
          const fiber = yield* Option.match(Option.fromUndefinedOr(running.get(name)), {
            onSome: (f) => Effect.succeed(f),
            onNone: () =>
              derived(name, film, score, take).pipe(
                Semaphore.withPermits(oneMix, 1),
                Effect.ensuring(Effect.sync(() => running.delete(name))),
                Effect.forkIn(scope),
                Effect.tap((f) => Effect.sync(() => running.set(name, f))),
              ),
          });
          return yield* Fiber.join(fiber);
        });

      const scoreMix = Effect.fn('Choices.scoreMix')(function* (film: FilmName, option: string) {
        return yield* mixed(film, Option.some(option), Option.none());
      });

      const takeAudio = Effect.fn('Choices.takeAudio')(function* (
        film: FilmName,
        sound: string,
        take: string,
      ) {
        yield* Effect.fromResult(offeredTake(film, yield* fresh.choices(film), sound, take));
        const { lock } = yield* library.load;
        const variant = Option.flatMap(Option.fromUndefinedOr(lock[sound]), (entry) =>
          Arr.findFirst([...entry.variants, ...entry.candidates], (v) => v.sha256 === take),
        );
        if (Option.isNone(variant)) return yield* TakeUnknown.make({ sound, take });
        return path.join(library.paths.dir, variant.value.file);
      });

      const takeMix = Effect.fn('Choices.takeMix')(function* (
        film: FilmName,
        sound: string,
        take: string,
      ) {
        return yield* mixed(film, Option.none(), Option.some({ sound, take }));
      });

      return Choices.of({ list, pickScore, curate, scoreMix, takeAudio, takeMix });
    }),
  );
}
