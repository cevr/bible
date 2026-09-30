// A film's choices: the options it is choosing between, each heard in place,
// and the pick written back where the film declares it.
//
// - A score's options (`sound.ts`'s `score.options`): each heard as the whole
//   film's mix with that option playing (`Mixer.render`), against the film's
//   latest render. A pick sets `play`: the one string in `sound.ts`, spliced
//   by the parser (`sound-source.ts`) through the SourceWriter.
// - A library sound's takes (`library.lock.json`): each heard alone (its
//   file) and in place (the whole mix with that take at every placement of
//   the sound). A take is kept, unkept or rejected by the library's own
//   operations (`SoundLibrary.keep`/`unkeep`/`reject`), recorded around the
//   lock's rewrite by the SourceWriter, so it is undone the same way.
//
// Every mix is derived once into the review's cache, keyed by the film's
// sources as they stand (the newest mtime under its folder and the lock), so a
// change to the film makes it again. A render set (a sketchbook) has no pick
// and is the review's (`review.ts`); a look is not a choice yet.

import {
  Array as Arr,
  Context,
  Crypto,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Predicate,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { UnknownSound } from '../core/errors.ts';
import type { Placed } from '../core/layout.ts';
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
import { musicKey, musicPlan, scoreOptions } from '../core/sound.ts';
import {
  type CandidateMissing,
  ChoiceUnknown,
  type FormatFailed,
  type ReviewToolFailed,
  type SourceRefused,
  TakeActRefused,
  TakeUnknown,
  type VariantMissing,
} from './errors.ts';
import {
  FilmRepo,
  type LoadError,
  type LoadedFilm,
  type PlaceError,
  placeFilm,
} from './film-repo.ts';
import { type LibraryError, SoundLibrary, hex } from './library.ts';
import { Media } from './media.ts';
import { type MixError, Mixer, type TakeInPlace } from './mixer.ts';
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

export type ChoicesError = LoadError | PlaceError | LibraryError | SourceRefused | PlatformError;

export interface ChoicesService {
  /** The film's choices as they stand, and the renders they are heard against. */
  readonly list: (film: string) => Effect.Effect<FilmChoices, ChoicesError>;
  /** Play `option`: `play` in `sound.ts`. */
  readonly pickScore: (
    film: string,
    option: string,
  ) => Effect.Effect<Picked, ChoicesError | ChoiceUnknown | RewriteError>;
  /** Keep, unkeep or reject a take (by its sha256) of a sound the film plays. */
  readonly curate: (
    film: string,
    sound: string,
    take: string,
    act: TakeAct,
  ) => Effect.Effect<
    Picked,
    | ChoicesError
    | ChoiceUnknown
    | TakeUnknown
    | TakeActRefused
    | UnknownSound
    | CandidateMissing
    | VariantMissing
    | FormatFailed
  >;
  /** The film's whole mix with `option` playing, as an m4a in the review's cache. */
  readonly scoreMix: (
    film: string,
    option: string,
  ) => Effect.Effect<string, ChoicesError | ChoiceUnknown | MixError | ReviewToolFailed>;
  /** A take's own file. */
  readonly takeAudio: (
    film: string,
    sound: string,
    take: string,
  ) => Effect.Effect<string, ChoicesError | ChoiceUnknown | TakeUnknown>;
  /** The film's whole mix with only this take at each of the sound's placements, as an m4a. */
  readonly takeMix: (
    film: string,
    sound: string,
    take: string,
  ) => Effect.Effect<
    string,
    ChoicesError | ChoiceUnknown | TakeUnknown | MixError | ReviewToolFailed
  >;
}

/** How long encoding one mix may take. */
const ENCODE_LIMIT = Duration.minutes(5);

/** The folders under a film's that hold no source of its sound (renders, caches). */
const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

/** Where a score option stands against the film's store: composed for the plan as it is, or not. */
export const scoreState = (
  made: Option.Option<{ readonly hash: string }>,
  key: Option.Option<string>,
): ScoreState =>
  Option.match(made, {
    onNone: () => 'missing',
    onSome: (m) => {
      if (Option.exists(key, (k) => k === m.hash)) return 'current';
      return 'stale';
    },
  });

/** A lock variant as a take the review lists: kept or waiting, its 1-based index in that list. */
export const takeOf = (
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
export const takesOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) => [
  ...Option.match(lock, { onNone: () => [], onSome: (l) => l.variants }).map((v, i) =>
    takeOf(entry, v, 'kept', i + 1),
  ),
  ...pendingOf(entry, lock).map((v, i) => takeOf(entry, v, 'candidate', i + 1)),
];

/** The library's verb for `act` on a take in `state`, when that act applies to it. */
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
  const sceneAt = (at: number) =>
    Option.getOrElse(
      Option.map(
        Arr.findLast(placed, (p) => p.start <= at),
        (p) => p.spec.id,
      ),
      () => '',
    );
  return Option.match(plan, { onNone: () => [], onSome: (p) => p.effects }).flatMap((e) =>
    Option.match(Option.fromUndefinedOr(effects.get(e.name)), {
      onNone: () => [],
      onSome: (effect) => [
        { sound: effect.sound, placement: { effect: e.name, scene: sceneAt(e.at), at: e.at } },
      ],
    }),
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
      const mixer = yield* Mixer;
      const media = yield* Media;
      const review = yield* Review;
      const crypto = yield* Crypto.Crypto;

      const soundFile = (film: string) => path.join(repo.paths(film).dir, 'sound.ts');

      /** The option `sound.ts` plays now, read from its text (the imported module is as it was at start). */
      const playing = (film: string) =>
        Effect.flatMap(fs.readFileString(soundFile(film)), (text) =>
          Effect.fromResult(readPlay(soundFile(film), text)),
        );

      /** The film's renders under the review's roots, newest first: its folder's, or named for it. */
      const pictures = Effect.fn('Choices.pictures')(function* (film: string) {
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

      const scoreChoice = (loaded: LoadedFilm, placed: ReadonlyArray<Placed>, picked: string) =>
        Option.map(
          Option.flatMap(loaded.sound, (s) => Option.fromUndefinedOr(s.score)),
          (score): ScoreChoice => ({
            _tag: 'ScoreChoice',
            picked,
            variants: scoreOptions(score).map((option) => {
              const key = Result.getSuccess(
                Result.map(musicPlan(option.music, placed), (plan) => musicKey(option.music, plan)),
              );
              return {
                id: option.name,
                styles: option.music.styles,
                acts: option.music.acts,
                state: scoreState(
                  Option.flatMap(Option.fromUndefinedOr(loaded.manifest.scores), (made) =>
                    Option.fromUndefinedOr(made[option.name]),
                  ),
                  key,
                ),
              };
            }),
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

      const list = Effect.fn('Choices.list')(function* (film: string) {
        const loaded = yield* repo.load(film);
        const placed = yield* placeFilm(loaded);
        const scored = Option.exists(loaded.sound, (s) => Predicate.isNotUndefined(s.score));
        const score = yield* Effect.when(playing(film), Effect.succeed(scored));
        const choices: ReadonlyArray<FilmChoice> = [
          ...Option.toArray(Option.flatMap(score, (picked) => scoreChoice(loaded, placed, picked))),
          ...effectChoices(loaded, placed),
        ];
        const result: FilmChoices = { film, pictures: yield* pictures(film), choices };
        return result;
      });

      /** The film's score option `option`, or `ChoiceUnknown`. */
      const optionOf = Effect.fn('Choices.optionOf')(function* (film: string, option: string) {
        const loaded = yield* repo.load(film);
        const score = Option.flatMap(loaded.sound, (s) => Option.fromUndefinedOr(s.score));
        const known = Option.match(score, {
          onNone: (): ReadonlyArray<string> => [],
          onSome: (s) => Object.keys(s.options),
        });
        if (!known.includes(option))
          return yield* ChoiceUnknown.make({ film, kind: 'score option', name: option, known });
        return loaded;
      });

      /** The library sound `sound` as the film's effects place it, and its take `take`. */
      const takeIn = Effect.fn('Choices.takeIn')(function* (
        film: string,
        sound: string,
        take: string,
      ) {
        const loaded = yield* repo.load(film);
        const placed = yield* placeFilm(loaded);
        const offered = effectChoices(loaded, placed);
        const choice = Arr.findFirst(offered, (c) => c.sound === sound);
        if (Option.isNone(choice))
          return yield* ChoiceUnknown.make({
            film,
            kind: 'sound',
            name: sound,
            known: offered.map((c) => c.sound),
          });
        const found = Arr.findFirst(choice.value.takes, (t) => t.id === take);
        const lock = Option.fromUndefinedOr(loaded.sounds.lock[sound]);
        const variant = Option.flatMap(lock, (l) =>
          Arr.findFirst([...l.variants, ...l.candidates], (v) => v.sha256 === take),
        );
        if (Option.isNone(found) || Option.isNone(variant))
          return yield* TakeUnknown.make({ sound, take });
        return { loaded, take: found.value, variant: variant.value };
      });

      const pickScore = Effect.fn('Choices.pickScore')(function* (film: string, option: string) {
        yield* optionOf(film, option);
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
        film: string,
        sound: string,
        take: string,
        act: TakeAct,
      ) {
        const found = yield* takeIn(film, sound, take);
        const acted = Option.getOrElse(Option.fromUndefinedOr(ACTED.get(act)), () => act);
        if (!actFits(act, found.take.state))
          return yield* TakeActRefused.make({ sound, take, act: acted, state: found.take.state });
        const file = library.paths.lock.file;
        const target = `sound ${sound} ${act} ${take.slice(0, 12)}`;
        type Run = Effect.Effect<
          LockEntry,
          LibraryError | UnknownSound | CandidateMissing | VariantMissing
        >;
        const run = Effect.suspend((): Run => {
          if (act === 'keep') return library.keep(sound, [found.take.index]);
          if (act === 'unkeep') return library.unkeep(sound, [found.take.index]);
          return library.reject(sound, [found.take.index]);
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
      const stamp = Effect.fn('Choices.stamp')(function* (film: string) {
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

      /** The mix `name` made: the film's with `score` and `take`, written to the cache as an m4a. */
      const derived = (
        name: string,
        film: string,
        score: Option.Option<string>,
        take: Option.Option<TakeInPlace>,
      ) =>
        review.derive(name, (temporary) =>
          Effect.gen(function* () {
            const { mixed: m } = yield* mixer.render(film, { warn: false, score, take });
            const wav = `${temporary}.wav`;
            yield* media.writeWav(wav, m.master);
            yield* review
              .ffmpeg(
                name,
                ['-i', wav, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', temporary],
                ENCODE_LIMIT,
              )
              .pipe(Effect.ensuring(Effect.ignore(fs.remove(wav, { force: true }))));
            yield* Effect.log(`review.mix film=${film} name=${name}`);
          }),
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

      /** The film's mix with `score` and `take` as asked, derived once into the cache as an m4a. */
      const mixed = (
        film: string,
        score: Option.Option<string>,
        take: Option.Option<TakeInPlace>,
      ) =>
        Effect.gen(function* () {
          const what = [
            film,
            Option.getOrElse(score, () => ''),
            ...Option.match(take, { onNone: () => [], onSome: (t) => [t.sound, t.take] }),
            yield* stamp(film),
          ];
          const digest = yield* Effect.orDie(
            crypto.digest('SHA-1', new TextEncoder().encode(what.join('|'))),
          );
          const name = `mix/${film}/${hex(digest).slice(0, 20)}.m4a`;
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

      const scoreMix = Effect.fn('Choices.scoreMix')(function* (film: string, option: string) {
        yield* optionOf(film, option);
        return yield* mixed(film, Option.some(option), Option.none());
      });

      const takeAudio = Effect.fn('Choices.takeAudio')(function* (
        film: string,
        sound: string,
        take: string,
      ) {
        const found = yield* takeIn(film, sound, take);
        return path.join(found.loaded.sounds.dir, found.variant.file);
      });

      const takeMix = Effect.fn('Choices.takeMix')(function* (
        film: string,
        sound: string,
        take: string,
      ) {
        yield* takeIn(film, sound, take);
        return yield* mixed(film, Option.none(), Option.some({ sound, take }));
      });

      return Choices.of({ list, pickScore, curate, scoreMix, takeAudio, takeMix });
    }),
  );
}
