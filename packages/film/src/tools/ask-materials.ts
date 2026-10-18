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
// it is not there.

import {
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Schema,
} from 'effect';
import { type Ask, type Material, materialsIn, scriptSource } from '../core/ask.ts';
import { panelById } from '../core/board.ts';
import {
  EVIDENCE_FILE,
  EVIDENCE_PAGE,
  ReviewRecordJson,
  evidenceProblems,
  keepRecommended,
} from '../core/review-record.ts';
import { docAt, videoAt } from '../core/review.ts';
import { BoardStore } from './board-store.ts';
import type { ContentStore } from './content-store.ts';
import type { FilmFolder } from './film-repo.ts';
import { filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { Review } from './review.ts';
import { SeriesDrafts } from './series-drafts.ts';
import type { StudioReadings } from './studio.ts';
import { beatAttempts } from './studio.ts';
import type { Takes } from './takes.ts';

/** What an ask is aimed at, as the keep gate reads it: its production, its set, and the owner's override. */
interface Aimed {
  readonly production?: string;
  readonly set?: string;
  readonly override?: { readonly quote: string };
}

interface AskMaterialsService {
  /** What `ask` names that the lab cannot show, each as the agent fixes it; none when all is there. */
  readonly problems: (ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
  /**
   * Why `ask`, aimed at `aimed`, may not recommend a keep: on a production,
   * a recommended option that keeps, locks or goes on needs its set's review
   * record (`core/review-record.ts`) from the scenes as they stand now, every
   * finding answered, unless the owner's own words override it. None when it
   * may.
   */
  readonly evidence: (aimed: Aimed, ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
}

/** `problem` when `wrong` holds, else nothing. */
const problemIf = (wrong: boolean, problem: string): ReadonlyArray<string> =>
  Bool.match(wrong, { onFalse: () => [], onTrue: () => [problem] });

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

      /** Film `name`, when the lab has one so named; else the problem. */
      const film = (where: string, name: string) =>
        filmNamed(name).pipe(
          Effect.provideContext(films),
          Effect.mapError(() => `${where}: the lab has no film ${name}`),
        );

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
              const index = yield* review.index(false);
              if (Option.isNone(docAt(index, block.ref)))
                return [
                  `${where}: no document ${block.ref} is listed by the review (a set's Markdown, as \`sets\` lists it)`,
                ];
              yield* review.resolve(block.ref).pipe(Effect.mapError(unread(where, block.ref)));
              return [];
            });
          case 'video':
            return Effect.gen(function* () {
              const index = yield* review.index(false);
              if (Option.isNone(videoAt(index, block.ref)))
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

      const problems = (ask: Ask) =>
        Effect.map(
          Effect.forEach(materialsIn(ask), ({ step, block }) =>
            found(step, block).pipe(Effect.catch((problem) => Effect.succeed([problem]))),
          ),
          (each) => each.flat(),
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

      /** Why the keep `which` (a step's recommended option) may not be asked for `aimed`: none when it may. */
      const evidenceFor = (aimed: Aimed & { readonly production: string }, which: string) =>
        Effect.gen(function* () {
          if (Predicate.isNotUndefined(aimed.override)) {
            yield* Effect.log(
              `asks.evidence override production=${aimed.production} chars=${aimed.override.quote.length}`,
            );
            return [];
          }
          if (Predicate.isUndefined(aimed.set))
            return [
              "name the set that holds the figures' review record (`set`), or override with the owner's own words",
            ];
          const record = yield* recordOf(aimed.set);
          const project = yield* fresh
            .project([record.film, '--json'])
            .pipe(
              Effect.mapError(
                (error) => `${record.film}'s scenes cannot be read now: ${error.message}`,
              ),
            );
          return evidenceProblems(record, new Map(project.scenes.map((s) => [s.scene, s.key])));
        }).pipe(
          Effect.catch((problem) => Effect.succeed([problem])),
          Effect.map((problems) => problems.map((p) => `${which}: a keep needs evidence: ${p}`)),
        );

      const evidence = (aimed: Aimed, ask: Ask) =>
        Option.match(
          Option.all({
            production: Option.fromUndefinedOr(aimed.production),
            which: keepRecommended(ask),
          }),
          {
            onNone: () => Effect.succeed([]),
            onSome: ({ production, which }) => evidenceFor({ ...aimed, production }, which),
          },
        );

      return AskMaterials.of({ problems, evidence });
    }),
  );
}
