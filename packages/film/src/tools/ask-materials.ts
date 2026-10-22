// The material an ask shows, found before the ask is kept: each material
// block (`core/ask.ts`) looked for through the read its own view makes, so
// an ask that names a document, a script, a Board, a video or a take the lab
// cannot show is refused when it is made, naming what is missing. A
// document or a video is a file the review lists (`Review.index`, the set's
// page's read), inside its root (`Review.resolve`); a film's script is its
// beats as the Script reader reads them (`FreshFilm.script`); a draft's, as
// its Markdown reads now (`SeriesDrafts.read`); a Board's panels are on the
// film's board (`BoardStore.read`); a take is one of the beat's attempts
// the studio lists (`beatAttempts`, the studio's route's own read, which
// refuses a beat the film does not have), the one named or the one kept. A ref
// is a ref, never a path: the review finds it among the files it lists, or
// it is not there. An image's `src` is one of the lab's image routes, its
// file found by the read that route makes (a set's file by `Review.resolve`,
// a board's by `BoardStore.image`, a note's still by `NotesStore.still`, a
// video's frame by the review's index); a path no image route takes would
// 404 on the page, so it is refused, named. The same read gives the file
// each image route serves as the ask is made (`served`), which the ask store
// copies and keeps, by its SHA-256, as the ask's receipt (`AskRecord.shown`).

import {
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { REVIEW_FILES, labUrls } from '../core/api.ts';
import { type Ask, type Material, imagesIn, materialsIn, scriptSource } from '../core/ask.ts';
import { panelById } from '../core/board.ts';
import {
  EVIDENCE_FILE,
  EVIDENCE_PAGE,
  ReviewRecordJson,
  evidenceProblems,
  keptOn,
  typingProblems,
} from '../core/review-record.ts';
import { type ReviewIndex, docAt, videoAt } from '../core/review.ts';
import { Segment } from '../core/segment.ts';
import { decodeComponent } from '@bible/url-state';
import { BoardStore } from './board-store.ts';
import type { ContentStore } from './content-store.ts';
import type { FilmFolder } from './film-repo.ts';
import { filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { NotesStore } from './notes-store.ts';
import { Review } from './review.ts';
import { refFromUrl } from './review-http.ts';
import { SeriesDrafts } from './series-drafts.ts';
import type { StudioReadings } from './studio.ts';
import { beatAttempts } from './studio.ts';
import type { Takes } from './takes.ts';

/**
 * What an ask is aimed at, as the keep gate reads it: its production, the
 * film its ledger names (`productionFilm`), its set, and the owner's override.
 */
interface Aimed {
  readonly production?: string;
  readonly productionFilm?: string;
  readonly set?: string;
  readonly override?: { readonly quote: string };
}

interface AskMaterialsService {
  /** What `ask` names that the lab cannot show, each as the agent fixes it; none when all is there. */
  readonly problems: (ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
  /**
   * The file each image `src` of `ask` is served from now, by the read its
   * route makes, once each in the order shown. A video's frame, and a `src`
   * the lab serves nothing at, have none.
   */
  readonly served: (ask: Ask) => Effect.Effect<ReadonlyArray<readonly [string, string]>>;
  /**
   * Why `ask`, aimed at `aimed`, may not be made as it recommends: on a
   * production, an ask that shows scenes or figures types each option's
   * outcome and each keep's subject (`untypedKeeps`), and a keep on its
   * recommended way that names a scene (`keeps.scenes`) needs its set's
   * review of each scene and figure kept (`core/review-record.ts`), from the
   * scene as it stands now, every finding on it answered, unless the owner's
   * own words override it. A keep of no scene (a script, a concept, a Board)
   * is never gated. None when it may.
   */
  readonly evidence: (aimed: Aimed, ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
}

/** What an image route serves: a file, a frame drawn from a video, or nothing. */
type Served =
  | { readonly _tag: 'File'; readonly file: string }
  | { readonly _tag: 'Frame' }
  | { readonly _tag: 'None' };

const NOT_SERVED: Served = { _tag: 'None' };
const FRAME_SERVED: Served = { _tag: 'Frame' };
const fileServed = (file: string): Served => ({ _tag: 'File', file });

/** `problem` when `wrong` holds, else nothing. */
const problemIf = (wrong: boolean, problem: string): ReadonlyArray<string> =>
  Bool.match(wrong, { onFalse: () => [], onTrue: () => [problem] });

/** A board's image route and a note's still's, by their path's segments after the film's. */
const FILM_IMAGE = /^\/api\/films\/([^/]+)\/(board\/files|stills)\/([^/]+)$/;

/** The review's frame route: a video's frame, by its ref in the query. */
const FRAME = labUrls.review.frame({ query: { ref: '' } }).split('?')[0];

/** A path component decoded, or none when it does not decode. */
const decoded = (component: string): Option.Option<string> =>
  Result.getSuccess(decodeComponent(component));

/** The ids `named` names that `known` does not hold. */
const unknownOf = (
  named: Option.Option<ReadonlyArray<string>>,
  known: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Option.match(named, {
    onNone: () => [],
    onSome: (list) => list.filter((id) => !known.includes(id)),
  });

export class AskMaterials extends Context.Service<AskMaterials, AskMaterialsService>()(
  '@bible/film/tools/AskMaterials',
) {
  static readonly layer = Layer.effect(
    AskMaterials,
    Effect.gen(function* () {
      const review = yield* Review;
      const fresh = yield* FreshFilm;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const drafts = yield* SeriesDrafts;
      const boards = yield* BoardStore;
      const films = yield* Effect.context<FilmFolder>();
      const studio = yield* Effect.context<StudioReadings | Takes | ContentStore | FilmFolder>();
      const notes = yield* NotesStore;

      /** Film `name`, when the lab has one so named; else the problem. */
      const film = (where: string, name: string) =>
        filmNamed(name).pipe(
          Effect.provideContext(films),
          Effect.mapError(() => `${where}: the lab has no film ${name}`),
        );

      /**
       * What `find` finds in the review's index: as it stands, or read again
       * once when it does not, so a set another process wrote since the
       * index was read (a terminal's `publish_set`) is found, as the review's
       * own `listed` finds it.
       */
      const indexed = <A>(find: (index: ReviewIndex) => Option.Option<A>) =>
        Effect.gen(function* () {
          const had = find(yield* review.index(false));
          if (Option.isSome(had)) return had;
          return find(yield* review.index(true));
        });

      /** A read's failure as the problem `what` cannot be read. */
      const unread =
        (where: string, what: string) =>
        (error: { readonly message: string }): string =>
          `${where}: ${what} cannot be read: ${error.message}`;

      /** What block `block`, on step `step`, names that the lab cannot show. */
      const found = (
        step: string,
        block: Material,
      ): Effect.Effect<ReadonlyArray<string>, string> => {
        const where = `step ${step}`;
        switch (block.kind) {
          case 'document':
            return Effect.gen(function* () {
              if (Option.isNone(yield* indexed((index) => docAt(index, block.ref))))
                return [
                  `${where}: no document ${block.ref} is listed by the review (a set's Markdown, as \`sets\` lists it)`,
                ];
              yield* review.resolve(block.ref).pipe(Effect.mapError(unread(where, block.ref)));
              return [];
            });
          case 'video':
            return Effect.gen(function* () {
              if (Option.isNone(yield* indexed((index) => videoAt(index, block.ref))))
                return [
                  `${where}: no video ${block.ref} is listed by the review (a set's video, as \`sets\` lists it)`,
                ];
              yield* review.resolve(block.ref).pipe(Effect.mapError(unread(where, block.ref)));
              return [];
            });
          case 'script': {
            const named = Option.fromUndefinedOr(block.beats);
            const source = scriptSource(block);
            if (source._tag === 'Film')
              return Effect.gen(function* () {
                const read = yield* fresh
                  .script(yield* film(where, source.film))
                  .pipe(Effect.mapError(unread(where, `the script of ${source.film}`)));
                return unknownOf(
                  named,
                  read.map((b) => b.id),
                ).map((id) => `${where}: the script of ${source.film} has no beat ${id}`);
              });
            const { series, draft } = source;
            return Effect.gen(function* () {
              const read = yield* drafts
                .read(series, draft)
                .pipe(Effect.mapError(unread(where, `draft ${series}/${draft}`)));
              return unknownOf(
                named,
                read.beats.map((b) => b.id),
              ).map((id) => `${where}: draft ${series}/${draft} has no beat ${id}`);
            });
          }
          case 'board':
            return Effect.gen(function* () {
              const named = yield* film(where, block.film);
              const board = yield* boards
                .read(named)
                .pipe(Effect.mapError(unread(where, `the Board of ${block.film}`)));
              if (board.panels.length === 0)
                return [`${where}: the Board of ${block.film} has no panel yet`];
              return Option.match(Option.fromUndefinedOr(block.panels), {
                onNone: () => [],
                onSome: (panels) =>
                  panels
                    .filter((id) => Option.isNone(panelById(board, id)))
                    .map((id) => `${where}: the Board of ${block.film} has no panel ${id}`),
              });
            });
          case 'audio':
            return Effect.gen(function* () {
              yield* film(where, block.film);
              // The studio's own read: a beat that is not one of the film's is refused before a file is read.
              const read = yield* beatAttempts({ film: block.film, beat: block.beat }).pipe(
                Effect.provideContext(studio),
                Effect.mapError((error) =>
                  Bool.match(Predicate.isTagged(error, 'UnknownScene'), {
                    onTrue: () => `${where}: ${block.film} has no beat ${block.beat}`,
                    onFalse: () => unread(where, `the takes of ${block.film} ${block.beat}`)(error),
                  }),
                ),
              );
              return Option.match(Option.fromUndefinedOr(block.attempt), {
                onSome: (attempt) =>
                  problemIf(
                    !read.attempts.some((a) => a.file === attempt),
                    `${where}: ${block.film} ${block.beat} has no take ${attempt}`,
                  ),
                // The take the timings name: an attempt kept, or a staging take.
                onNone: () =>
                  problemIf(
                    !read.attempts.some((a) => a.kept) && Predicate.isUndefined(read.staged),
                    `${where}: ${block.film} ${block.beat} has no take: name an attempt`,
                  ),
              });
            });
        }
      };

      /**
       * What the lab serves at `src`, by the read its route makes: the file
       * a set's, a board's or a note's image route serves (`File`), a frame
       * the review draws from a video it lists (`Frame`), or nothing (a path
       * no image route takes, or one whose read finds no file).
       */
      const servedAt = (src: string): Effect.Effect<Served> => {
        const url = new URL(src, 'http://lab.invalid');
        const filmImage = Option.flatMap(Option.fromNullishOr(FILM_IMAGE.exec(url.pathname)), (m) =>
          Option.all([
            Option.flatMap(Option.fromUndefinedOr(m[1]), decoded),
            Option.fromUndefinedOr(m[2]),
            Option.flatMap(Option.fromUndefinedOr(m[3]), decoded),
          ]),
        );
        const reads: ReadonlyArray<Option.Option<Effect.Effect<Served, unknown>>> = [
          Option.map(refFromUrl(src, REVIEW_FILES), (ref) =>
            Effect.map(review.resolve(ref), fileServed),
          ),
          Option.map(filmImage, ([name, route, file]) =>
            Effect.flatMap(Effect.provideContext(filmNamed(name), films), (named) =>
              Bool.match(route === 'stills', {
                onTrue: () =>
                  Effect.map(
                    notes.still(named, file),
                    Option.match({ onNone: () => NOT_SERVED, onSome: fileServed }),
                  ),
                onFalse: () =>
                  Effect.flatMap(
                    Effect.fromOption(
                      Option.match(Option.fromNullishOr(url.searchParams.get('folder')), {
                        onNone: () => Option.some(Option.none<Segment>()),
                        onSome: (folder) =>
                          Option.map(Schema.decodeOption(Segment)(folder), Option.some),
                      }),
                    ),
                    (folder) =>
                      Effect.map(
                        boards.image(named, file, Option.getOrUndefined(folder)),
                        fileServed,
                      ),
                  ),
              }),
            ),
          ),
          Option.map(
            Option.filter(
              Option.fromNullishOr(url.searchParams.get('ref')),
              () => url.pathname === FRAME,
            ),
            (ref) =>
              Effect.map(
                indexed((index) => videoAt(index, ref)),
                Option.match({ onNone: (): Served => NOT_SERVED, onSome: () => FRAME_SERVED }),
              ),
          ),
        ];
        return Option.match(Option.firstSomeOf(reads), {
          onNone: () => Effect.succeed(NOT_SERVED),
          onSome: (read) => Effect.orElseSucceed(read, () => NOT_SERVED),
        });
      };

      /** Each image `src` of `ask`, once each, in the order shown. */
      const srcsOf = (ask: Ask) => [
        ...new Set(
          imagesIn(ask).flatMap((image) => Option.toArray(Option.fromUndefinedOr(image.src))),
        ),
      ];

      /** `src` with the file its route serves, when it serves a file. */
      const fileOf = (src: string): Effect.Effect<ReadonlyArray<readonly [string, string]>> =>
        Effect.map(servedAt(src), (at) =>
          Match.value(at).pipe(
            Match.tag('File', ({ file }) => [[src, file] as const]),
            Match.orElse(() => []),
          ),
        );

      const served = (ask: Ask) =>
        Effect.map(Effect.forEach(srcsOf(ask), fileOf), (each) => each.flat());

      /** Every image `ask` shows by its `src` that the lab does not serve, named. */
      const images = (ask: Ask) =>
        Effect.map(
          Effect.forEach(srcsOf(ask), (src) =>
            Effect.map(servedAt(src), (at) =>
              problemIf(
                at._tag === 'None',
                `image ${src}: the lab serves no image there (a set's file is at the link \`set\` and \`publish_set\` answer for it, under ${REVIEW_FILES}; a board try, {board: {film, panel, try}})`,
              ),
            ),
          ),
          (each) => each.flat(),
        );

      const problems = (ask: Ask) =>
        Effect.map(
          Effect.all([
            Effect.forEach(materialsIn(ask), ({ step, block }) =>
              found(step, block).pipe(Effect.catch((problem) => Effect.succeed([problem]))),
            ),
            images(ask),
          ]),
          ([each, unserved]) => [...each.flat(), ...unserved],
        );

      /** The set's review record, as the set lists it, decoded; or why there is none. */
      const recordOf = (set: string) =>
        Effect.gen(function* () {
          const page = yield* review
            .resolve(`${set}/${EVIDENCE_PAGE}`)
            .pipe(
              Effect.mapError(
                () =>
                  `set ${set} holds no review record (${EVIDENCE_PAGE}): run film review <film> --set <name> --scene <id> --at <place> --at <place> before asking to keep`,
              ),
            );
          const file = path.join(path.dirname(path.dirname(page)), EVIDENCE_FILE);
          const text = yield* fs
            .readFileString(file)
            .pipe(
              Effect.mapError(
                () => `set ${set} lists ${EVIDENCE_PAGE} but has no ${EVIDENCE_FILE}`,
              ),
            );
          return yield* Schema.decodeEffect(ReviewRecordJson)(text).pipe(
            Effect.mapError((error) => `${file} does not read: ${error.message}`),
          );
        });

      /** Each scene's key in `film` as its sources stand now, or why they cannot be read. */
      const keysNow = (film: string) =>
        fresh.project([film, '--json']).pipe(
          Effect.map((project) => new Map(project.scenes.map((s) => [s.scene, s.key]))),
          Effect.mapError((error) => `${film}'s scenes cannot be read now: ${error.message}`),
        );

      const evidence = (aimed: Aimed, ask: Ask) =>
        Option.match(Option.fromUndefinedOr(aimed.production), {
          onNone: () => Effect.succeed([]),
          onSome: (production) =>
            Effect.gen(function* () {
              const kept = keptOn(ask);
              const typed = typingProblems(
                ask,
                production,
                Option.fromUndefinedOr(aimed.productionFilm),
              );
              if (kept.length === 0) return typed;
              if (Predicate.isNotUndefined(aimed.override)) {
                yield* Effect.log(
                  `asks.evidence override production=${production} chars=${aimed.override.quote.length}`,
                );
                return typed;
              }
              const needed = Effect.gen(function* () {
                const set = yield* Effect.fromOption(Option.fromUndefinedOr(aimed.set)).pipe(
                  Effect.mapError(
                    () =>
                      "name the set that holds the figures' review record (`set`), or override with the owner's own words",
                  ),
                );
                const record = yield* recordOf(set);
                return yield* Effect.forEach(kept, ({ which, keeps }) =>
                  Effect.map(keysNow(keeps.film), (now) =>
                    evidenceProblems(record, keeps, now).map(
                      (p) => `${which}: a keep needs evidence: ${p}`,
                    ),
                  ).pipe(
                    Effect.catch((p) => Effect.succeed([`${which}: a keep needs evidence: ${p}`])),
                  ),
                );
              }).pipe(
                Effect.map((each) => each.flat()),
                Effect.catch((p) =>
                  Effect.succeed(kept.map(({ which }) => `${which}: a keep needs evidence: ${p}`)),
                ),
              );
              return [...typed, ...(yield* needed)];
            }),
        });

      return AskMaterials.of({ problems, served, evidence });
    }),
  );
}
