// A film's choices: its choice points (`core/choice.ts`, listed by
// `choice-points.ts`), each variant heard in place, and each verb landed
// where the film declares the pick:
//
// - score: `play` in `sound.ts`, and look: `play` of a look in `palette.ts`,
//   each the one string spliced by the parser (`choice-source.ts`) through
//   the SourceWriter;
// - take: kept, unkept or rejected by its sha256 through the library's own
//   operations (`SoundLibrary.keep`/`unkeep`/`reject`), recorded around the
//   lock's rewrite by the SourceWriter, so it is undone the same way;
// - voice: an attempt kept as its beat's take by the film CLI in a fresh
//   process (it reads the script), recorded around the timings' rewrite;
// - level: a sound layer's level (or the constant layers share) written into
//   `sound.ts` through the SourceWriter;
// - approve and comment: the catalogue's records (`RenderCatalogue`), on the
//   variant as it is now.
//
// The review runs for days and its own imports of a film stay as they were at
// start, so the film's points are read, and its mixes made, in a fresh
// process (`FreshFilm`, `choices-process.ts`): every answer is the film as it
// stands on disk.
//
// Every mix is derived once into the review's cache, keyed by the film's
// sources as they stand (the newest mtime under its folder and the lock), so a
// change to the film makes it again.

import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Catalogue, type Subject, approve, comment } from '../core/catalogue.ts';
import {
  type ApprovePost,
  type ChoicePoint,
  type ChoiceVariant,
  type ChoiceVerb,
  type CommentPost,
  type FilmChoices,
  type KnobPost,
  type PickPost,
  pointName,
  pointNamed,
  subjectAt,
  variantNamed,
} from '../core/choice.ts';
import type { UnknownSound } from '../core/errors.ts';
import { type CatalogueError, RenderCatalogue } from './catalogue.ts';
import {
  SCORE_PLAY,
  editLevel,
  editPick,
  levelTargetOf,
  lookPlay,
  readPick,
} from './choice-source.ts';
import { FreshFilm, type FreshRefusal } from './choices-process.ts';
import { cacheKey } from './digest.ts';
import {
  ChoiceUnknown,
  type FormatFailed,
  type FreshProcessFailed,
  type ReviewToolFailed,
  type SourceRefused,
  VariantUnknown,
  VerbRefused,
} from './errors.ts';
import { type FilmName, FilmRepo, type LoadError } from './film-repo.ts';
import { type LibraryError, SoundLibrary } from './library.ts';
import { Review } from './review.ts';
import { type Change, type RewriteError, SourceWriter } from './source-writer.ts';
import { Takes } from './takes.ts';

/** What a verb did: the change it made (none when it was already so). */
export interface Picked {
  /** The file it rewrote. */
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
}

export type ChoicesError =
  | FreshProcessFailed
  | FreshRefusal
  | LibraryError
  | SourceRefused
  | PlatformError;

export interface ChoicesService {
  /** The film's choice points as they stand, and the renders they are heard against. */
  readonly list: (film: FilmName) => Effect.Effect<FilmChoices, ChoicesError>;
  /** A verb on one variant, landed where the film declares its pick. */
  readonly pick: (
    film: FilmName,
    pick: PickPost,
  ) => Effect.Effect<Picked, ChoicesError | RewriteError | UnknownSound | FormatFailed>;
  /** A level point's knob, written into `sound.ts`. */
  readonly knob: (
    film: FilmName,
    knob: KnobPost,
  ) => Effect.Effect<Picked, ChoicesError | RewriteError>;
  /** One variant approved as it is now; the choices after it. */
  readonly approve: (
    film: FilmName,
    said: ApprovePost,
  ) => Effect.Effect<FilmChoices, ChoicesError | CatalogueError>;
  /** Something said of one variant as it is now; the choices after it. */
  readonly comment: (
    film: FilmName,
    said: CommentPost,
  ) => Effect.Effect<FilmChoices, ChoicesError | CatalogueError>;
  /** A variant's own file: a take's, an attempt's. */
  readonly alone: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | LoadError>;
  /** The film's whole mix with the variant in place, as an m4a in the review's cache. */
  readonly inPlace: (
    film: FilmName,
    point: string,
    variant: string,
  ) => Effect.Effect<string, ChoicesError | ReviewToolFailed>;
}

/** The folders under a film's that hold no source of its sound (renders, caches). */
const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

/** The point `id` among `points`, or `ChoiceUnknown` naming the ones there are. */
export const offeredPoint = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  id: string,
): Result.Result<ChoicePoint, ChoiceUnknown> =>
  Result.fromOption(pointNamed(points, id), () =>
    ChoiceUnknown.make({ film, point: id, known: points.map((p) => p.id) }),
  );

/** The variant `id` of `point`, or `VariantUnknown` naming the ones it has. */
export const offeredVariant = (
  film: string,
  point: ChoicePoint,
  id: string,
): Result.Result<ChoiceVariant, VariantUnknown> =>
  Result.fromOption(variantNamed(point, id), () =>
    VariantUnknown.make({
      film,
      point: point.id,
      variant: id,
      known: point.variants.map((v) => v.id),
    }),
  );

/** The point and variant a request names, among `points`. */
export const offered = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  point: string,
  variant: string,
): Result.Result<
  { readonly point: ChoicePoint; readonly variant: ChoiceVariant },
  ChoiceUnknown | VariantUnknown
> =>
  Result.flatMap(offeredPoint(film, points, point), (p) =>
    Result.map(offeredVariant(film, p, variant), (v) => ({ point: p, variant: v })),
  );

/** Whether `verb` applies to `variant` as it stands, or why not. */
const verbFits = (
  point: ChoicePoint,
  variant: ChoiceVariant,
  verb: ChoiceVerb,
): Result.Result<void, VerbRefused> => {
  if (variant.verbs.includes(verb)) return Result.void;
  const standing = Match.value(variant.picked).pipe(
    Match.when(true, () => `it is picked`),
    Match.orElse(() => `it is ${variant.state}, not picked`),
  );
  const reason = Match.value(point.kind).pipe(
    Match.when('render', () => 'a render is approved, not picked'),
    Match.when('level', () => 'a level is set with its knob'),
    Match.orElse(() => `${standing}: it allows ${variant.verbs.join(', ') || 'nothing'}`),
  );
  return Result.fail(VerbRefused.make({ point: point.id, variant: variant.id, verb, reason }));
};

/** How a verb reads in a change's target: `keep`, `unkeep`, `reject`, `play`. */
const TAKE_ACT = { pick: 'keep', unpick: 'unkeep', reject: 'reject' } as const;

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
      const catalogues = yield* RenderCatalogue;
      const takes = yield* Takes;

      const fileIn = (film: FilmName, name: string) => path.join(repo.paths(film).dir, name);

      const list = Effect.fn('Choices.list')(function* (film: FilmName) {
        const points = yield* fresh.choices(film);
        // The film's whole-film renders, by its catalogues: a scene or a short is never its picture.
        const result: FilmChoices = { film, pictures: yield* review.pictures(film), points };
        return result;
      });

      /** `play` at `site` in `file` set to `option`, through the writer. */
      const writePick = (
        film: FilmName,
        file: string,
        site: Parameters<typeof editPick>[2],
        option: string,
      ) =>
        Effect.map(
          writer.write({
            film,
            scene: Option.none(),
            file,
            target: `${site.target} ${option}`,
            edit: (source) => editPick(file, source, site, option),
            verify: (after) =>
              Result.map(readPick(file, after, site), (read) =>
                Arr.filter(['play'], () => read !== option),
              ),
            check: () => Effect.void,
          }),
          (change): Picked => ({
            file,
            target: `${site.target} ${option}`,
            change: Option.liftPredicate(change, (c) => c.before !== c.after),
          }),
        );

      /** A take kept, unkept or rejected by its sha256, recorded around the lock's rewrite. */
      const actOnTake = Effect.fn('Choices.actOnTake')(function* (
        film: FilmName,
        sound: string,
        take: string,
        verb: ChoiceVerb,
      ) {
        const file = library.paths.lock.file;
        const target = `sound ${sound} ${TAKE_ACT[verb]} ${take.slice(0, 12)}`;
        const run = Match.value(verb).pipe(
          Match.when('pick', () => library.keep(sound, [take])),
          Match.when('unpick', () => library.unkeep(sound, [take])),
          Match.orElse(() => library.reject(sound, [take])),
        );
        const [, change] = yield* writer.around(film, file, target, run);
        const picked: Picked = { file, target, change };
        return picked;
      });

      /** A beat's attempt kept as its take in a fresh process, recorded around the timings' rewrite. */
      const keepVoice = Effect.fn('Choices.keepVoice')(function* (
        film: FilmName,
        beat: string,
        file: string,
      ) {
        const timings = repo.paths(film).timings.file;
        const target = `voice ${beat} keep ${file}`;
        const [kept, change] = yield* writer.around(
          film,
          timings,
          target,
          fresh.keepVoice(film, beat, file),
        );
        if (!kept.mixed)
          yield* Effect.logWarning(`choices.voice.unmixed film=${film} beat=${beat}`);
        const picked: Picked = { file: timings, target, change };
        return picked;
      });

      const pick = Effect.fn('Choices.pick')(function* (film: FilmName, asked: PickPost) {
        const { point, variant } = yield* Effect.fromResult(
          offered(film, yield* fresh.choices(film), asked.point, asked.variant),
        );
        yield* Effect.fromResult(verbFits(point, variant, asked.verb));
        const name = pointName(point);
        return yield* Match.value(point.kind).pipe(
          Match.when('score', () =>
            writePick(film, fileIn(film, 'sound.ts'), SCORE_PLAY, variant.id),
          ),
          Match.when('look', () =>
            writePick(film, fileIn(film, 'palette.ts'), lookPlay(name), variant.id),
          ),
          Match.when('take', () => actOnTake(film, name, variant.id, asked.verb)),
          Match.when('voice', () => keepVoice(film, name, variant.id)),
          Match.orElse(() =>
            Effect.fail(
              VerbRefused.make({
                point: point.id,
                variant: variant.id,
                verb: asked.verb,
                reason: `a ${point.kind} has no pick`,
              }),
            ),
          ),
        );
      });

      const knob = Effect.fn('Choices.knob')(function* (film: FilmName, asked: KnobPost) {
        const point = yield* Effect.fromResult(
          offeredPoint(film, yield* fresh.choices(film), asked.point),
        );
        const refused = (reason: string) =>
          VerbRefused.make({ point: point.id, variant: '', verb: 'set', reason });
        const knob = yield* Effect.fromOption(point.knob, () => refused('it has no knob'));
        if (Option.isSome(knob.fixed)) return yield* refused(knob.fixed.value);
        const target = yield* Effect.fromOption(levelTargetOf(point.id), () =>
          refused('it is not a level'),
        );
        const value = Math.min(knob.max, Math.max(knob.min, asked.value));
        const file = fileIn(film, 'sound.ts');
        const change = yield* writer.write({
          film,
          scene: Option.none(),
          file,
          target: `${point.id} ${value}`,
          edit: (source) => editLevel(file, source, target, value),
          verify: () => Result.succeed([]),
          check: () => Effect.void,
        });
        const picked: Picked = {
          file,
          target: `${point.id} ${value}`,
          change: Option.liftPredicate(change, (c) => c.before !== c.after),
        };
        return picked;
      });

      /** Record what the owner says of one variant in the film's catalogue, then list again. */
      const say = Effect.fn('Choices.say')(function* (
        film: FilmName,
        asked: { readonly point: string; readonly variant: string },
        change: (catalogue: Catalogue, subject: Subject, at: number) => Catalogue,
      ) {
        const { point, variant } = yield* Effect.fromResult(
          offered(film, yield* fresh.choices(film), asked.point, asked.variant),
        );
        const address = yield* Effect.fromOption(point.address, () =>
          VerbRefused.make({
            point: point.id,
            variant: variant.id,
            verb: 'say',
            reason: 'it belongs to no film address',
          }),
        );
        const at = yield* Clock.currentTimeMillis;
        const subject = subjectAt(point.id, point.kind, address, variant);
        yield* catalogues.update(repo.paths(film), (catalogue) => [
          subject,
          change(catalogue, subject, at),
        ]);
        yield* Effect.log(
          `choices.say film=${film} point=${point.id} variant=${variant.id.slice(0, 12)}`,
        );
        return yield* list(film);
      });

      const approveVariant = (film: FilmName, asked: ApprovePost) => say(film, asked, approve);

      const commentVariant = (film: FilmName, asked: CommentPost) =>
        say(film, asked, (catalogue, subject, at) => comment(catalogue, subject, asked.text, at));

      const alone = Effect.fn('Choices.alone')(function* (
        film: FilmName,
        point: string,
        variant: string,
      ) {
        const found = yield* Effect.fromResult(
          offered(film, yield* fresh.choices(film), point, variant),
        );
        const unheard = VerbRefused.make({
          point,
          variant,
          verb: 'hear alone',
          reason: 'it is not heard alone',
        });
        if (!Option.exists(Option.some(found.variant.media), (m) => m._tag === 'Heard' && m.alone))
          return yield* unheard;
        const name = pointName(found.point);
        if (found.point.kind === 'voice') {
          const at = yield* takes.attemptFile(yield* repo.load(film), name, variant);
          return yield* Effect.fromOption(at, () => unheard);
        }
        const { lock } = yield* library.load;
        const take = Option.flatMap(Option.fromUndefinedOr(lock[name]), (entry) =>
          Arr.findFirst([...entry.variants, ...entry.candidates], (v) => v.sha256 === variant),
        );
        return yield* Option.match(take, {
          onNone: () => Effect.fail(unheard),
          onSome: (t) => Effect.succeed(path.join(library.paths.dir, t.file)),
        });
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

      /** The mix `name` made in a fresh process: the film's with `variant` of `point` in place. */
      const derived = (name: string, film: FilmName, point: string, variant: string) =>
        review.derive(name, (temporary) =>
          fresh
            .mix(film, point, variant, temporary)
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
       * The film's mix with `variant` of `point` in place, derived once into
       * the cache as an m4a. The fresh process checks the point and variant
       * are the film's: a name it lacks is answered as unknown, and nothing is
       * cached.
       */
      const inPlace = Effect.fn('Choices.inPlace')(function* (
        film: FilmName,
        point: string,
        variant: string,
      ) {
        const key = cacheKey([film, point, variant, yield* stamp(film)]);
        const name = `mix/${film}/${key}.m4a`;
        const fiber = yield* Option.match(Option.fromUndefinedOr(running.get(name)), {
          onSome: (f) => Effect.succeed(f),
          onNone: () =>
            derived(name, film, point, variant).pipe(
              Semaphore.withPermits(oneMix, 1),
              Effect.ensuring(Effect.sync(() => running.delete(name))),
              Effect.forkIn(scope),
              Effect.tap((f) => Effect.sync(() => running.set(name, f))),
            ),
        });
        return yield* Fiber.join(fiber);
      });

      return Choices.of({
        list,
        pick,
        knob,
        approve: approveVariant,
        comment: commentVariant,
        alone,
        inPlace,
      });
    }),
  );
}
