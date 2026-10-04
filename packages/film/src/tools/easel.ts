// The easel: a still of a scene as its sources stand, in about a second, with
// no render (`film look`). The lab holds one export page per film warm in
// this process's Chrome (`Browser`) on its own server, and a look seeks it
// to the frame and takes the canvas as the view asks (`still`, the export
// handle's call). Never a stale image: every look first asks the pages'
// build as it stands (`LabPage.built`, which hears a save the watch missed
// and waits out a build under way), refuses a failed build with its words,
// and reopens the page when the build moved, so the page always runs the
// code on disk. Each still is written once, under the film's
// `out/<film>/look/<scene>/`, named by its time, view and build.
//
// A wedge (a printer's term: one strip printed at each of several grades,
// to choose one) draws a look at another level than the one it plays: the
// film's `palette.ts` is read as a pick of that level would write it
// (`editPick`, the very edit a pick makes), only in the build (`LabPage.wedge`),
// and never written. Its page is held beside the film's own, a few at most.

import {
  Array as Arr,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import {
  type Look,
  LabElsewhere,
  LookFailed,
  LookLevelUnknown,
  type LookPost,
  type LookTaken,
  PagesBroken,
  type PlaceError,
  type SceneTimes,
  lookFileName,
  momentOf,
  viewBox,
  wedgeName,
} from '../core/easel.ts';
import { UnknownScene } from '../core/errors.ts';
import type { SourceRefused } from '../core/refusals.ts';
import { Browser, type FramePage } from './browser.ts';
import { editPick, lookLevels, lookPlay } from './choice-source.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';
import { LabPage, type PagesNow } from './lab-page.ts';

/** Why a look drew nothing, each its own tag. */
type LookError =
  | PlaceError
  | UnknownScene
  | PagesBroken
  | LookFailed
  | LabElsewhere
  | LookLevelUnknown
  | SourceRefused;

interface EaselService {
  /** The lab's own address, once it is bound: the pages a look opens are served there. */
  readonly serve: (origin: string) => Effect.Effect<void>;
  /** `post`'s stills of `film`, drawn from the pages' build as it stands (or its wedge), and written. */
  readonly look: (film: FilmName, post: LookPost) => Effect.Effect<LookTaken, LookError>;
}

/** A page held warm: the build it loaded, its scenes' clocks, and the scope it closes with. */
interface Held {
  readonly build: string;
  readonly page: FramePage;
  readonly scenes: ReadonlyArray<SceneTimes>;
  readonly scope: Scope.Closeable;
}

/** The most pages held at once: a film's own and the wedges a judge draws beside it. */
const HELD_MAX = 4;

/** The film's file that declares its looks (`export const looks`). */
const PALETTE_FILE = 'palette.ts';

/** The lab's address as its own process reaches it: a wildcard bind is loopback. */
const reachable = (origin: string): string =>
  origin.replace('//0.0.0.0', '//127.0.0.1').replace('//[::]', '//127.0.0.1');

/** `film`'s export page on the lab at `origin`, of the wedge `wedge` when there is one. */
const easelUrl = (origin: string, film: string, wedge: string): string =>
  new URL(
    `films/${encodeURIComponent(film)}/play?${['export', ...Arr.filter([`wedge=${encodeURIComponent(wedge)}`], () => wedge !== '')].join('&')}`,
    reachable(origin),
  ).href;

/** A page's failure, said as the look's. */
const failedLook = (error: { readonly message: string }) =>
  LookFailed.make({ reason: error.message });

/**
 * `source` (the palette at `file`) as a pick of each of `levels` would write
 * it, each look and level checked against the ones it declares.
 */
const wedged = (
  file: string,
  source: string,
  levels: Readonly<Record<string, string>>,
): Result.Result<string, LookLevelUnknown | SourceRefused> => {
  type Wedged = Result.Result<string, LookLevelUnknown | SourceRefused>;
  return Result.flatMap(lookLevels(file, source), (declared) =>
    Object.entries(levels).reduce<Wedged>(
      (text, [look, level]) =>
        Result.flatMap(text, (now): Wedged =>
          Option.match(Option.fromUndefinedOr(declared.get(look)), {
            onNone: (): Wedged =>
              Result.fail(
                LookLevelUnknown.make({
                  look,
                  level,
                  missing: 'look',
                  known: [...declared.keys()],
                }),
              ),
            onSome: (known): Wedged => {
              if (!known.includes(level))
                return Result.fail(LookLevelUnknown.make({ look, level, missing: 'level', known }));
              return editPick(file, now, lookPlay(look), level);
            },
          }),
        ),
      Result.succeed(source),
    ),
  );
};

export class Easel extends Context.Service<Easel, EaselService>()('@bible/film/tools/Easel') {
  /** Pages in this process's Chrome, held until the layer's scope closes. */
  static readonly layer: Layer.Layer<
    Easel,
    never,
    Browser | LabPage | FilmFolder | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    Easel,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const pages = yield* LabPage;
      const folder = yield* FilmFolder;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const scope = yield* Effect.scope;
      const origin = yield* Deferred.make<string>();
      const one = yield* Semaphore.make(1);
      // Each page held, by its film and wedge (`film`, `film?ground-light`), oldest first.
      const held = new Map<string, Held>();

      const drop = (key: string) =>
        Option.match(Option.fromUndefinedOr(held.get(key)), {
          onNone: () => Effect.void,
          onSome: (h) =>
            Effect.andThen(
              Effect.sync(() => held.delete(key)),
              Scope.close(h.scope, Exit.void),
            ),
        });

      /** The page at `key` on `build`: the one held, else a fresh one at `url` (the old one closed). */
      const pageOn = Effect.fn('Easel.page')(function* (key: string, build: string, url: string) {
        const kept = Option.filter(Option.fromUndefinedOr(held.get(key)), (h) => h.build === build);
        if (Option.isSome(kept)) return kept.value;
        yield* drop(key);
        // The oldest page goes first when the easel holds its most.
        for (const old of [...held.keys()].slice(0, Math.max(0, held.size - HELD_MAX + 1)))
          yield* drop(old);
        // The page's own scope closes on every exit but a page held: a failure, and a look
        // cancelled while the page opens, close it, so no page lives on unheld.
        const opened = yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const own = yield* Scope.fork(scope);
            return yield* restore(
              Effect.gen(function* () {
                const page = yield* Scope.provide(own)(browser.open(url));
                const scenes = yield* page.call('scenes');
                return { build, page, scenes, scope: own } satisfies Held;
              }),
            ).pipe(
              Effect.onExit((exit) => {
                if (Exit.isSuccess(exit)) return Effect.sync(() => void held.set(key, exit.value));
                return Scope.close(own, Exit.void);
              }),
            );
          }),
        ).pipe(Effect.mapError(failedLook));
        yield* Effect.log(
          `easel.page.opened page=${key} build=${build} scenes=${opened.scenes.length}`,
        );
        return opened;
      });

      /** The pages' build as the sources stand, or its wedge at `levels`: its build and wedge id. */
      const buildFor = Effect.fn('Easel.build')(function* (
        film: FilmName,
        levels: Readonly<Record<string, string>>,
      ) {
        const entries = Object.entries(levels);
        if (!Arr.isArrayNonEmpty(entries)) {
          const now: PagesNow = yield* pages.built;
          return { ...now, wedge: '' };
        }
        const file = path.join(folder.paths(film).dir, PALETTE_FILE);
        if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) {
          const [look, level] = Arr.headNonEmpty(entries);
          return yield* LookLevelUnknown.make({ look, level, missing: 'look', known: [] });
        }
        // The bundler names a file by its real path.
        const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => file));
        const source = yield* fs.readFileString(real).pipe(Effect.mapError(failedLook));
        const text = yield* Effect.fromResult(wedged(real, source, levels));
        return yield* pages.wedge(new Map([[real, text]]));
      });

      const look = Effect.fn('Easel.look')(function* (film: FilmName, post: LookPost) {
        const started = yield* Clock.currentTimeMillis;
        const paths = folder.paths(film);
        const elsewhere = Option.filter(
          Option.map(Option.fromUndefinedOr(post.from), (from) => ({
            lab: path.resolve(paths.dir),
            here: path.resolve(from, film),
          })),
          (where) => where.here !== where.lab,
        );
        if (Option.isSome(elsewhere)) return yield* LabElsewhere.make(elsewhere.value);
        const levels = Option.getOrElse(Option.fromUndefinedOr(post.levels), () => ({}));
        const wedge = wedgeName(levels);
        const now = yield* buildFor(film, levels);
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        const build = [now.build.server, now.build.build, ...[now.wedge].filter(Boolean)].join('.');
        const builtAt = yield* Clock.currentTimeMillis;
        const key = [film, ...[wedge].filter(Boolean)].join('?');
        const page = yield* pageOn(
          key,
          build,
          easelUrl(yield* Deferred.await(origin), film, now.wedge),
        );
        const pageAt = yield* Clock.currentTimeMillis;
        const scene = yield* Effect.fromOption(
          Option.fromUndefinedOr(page.scenes.find((s) => s.id === post.scene)),
        ).pipe(
          Effect.mapError(() =>
            UnknownScene.make({ scene: post.scene, known: page.scenes.map((s) => s.id) }),
          ),
        );
        const { info } = page.page;
        const box = yield* Effect.fromResult(viewBox(post.view, info.width, info.height));
        const moments = yield* Effect.forEach(post.at, (at) =>
          Effect.fromResult(momentOf(scene, info.fps, at)),
        );
        const dir = path.join(paths.out, 'look', scene.id);
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failedLook));
        const looks = yield* Effect.forEach(moments, (moment) =>
          Effect.gen(function* () {
            // A page that failed a frame is not trusted with the next: the next look opens a fresh one.
            const bytes = yield* page.page
              .call('still', moment.frame, post.view)
              .pipe(Effect.tapError(() => drop(key)));
            const file = path.join(dir, lookFileName(moment, post.view, build, wedge));
            yield* fs.writeFile(file, bytes);
            return {
              file,
              scene: scene.id,
              at: moment.at,
              frame: moment.frame,
              time: moment.time,
              width: box.dw,
              height: box.dh,
            } satisfies Look;
          }).pipe(Effect.mapError(failedLook)),
        );
        const doneAt = yield* Clock.currentTimeMillis;
        // Where the time went: asking the build, opening a page (0 when held), drawing and writing.
        yield* Effect.log(
          `easel.look film=${film} scene=${scene.id} stills=${looks.length} mode=${post.view.mode} wedge=${wedge || 'none'} build=${build} ms=${doneAt - started} built_ms=${builtAt - started} page_ms=${pageAt - builtAt} draw_ms=${doneAt - pageAt}`,
        );
        return { build, looks } satisfies LookTaken;
      });

      return Easel.of({
        serve: (at) => Effect.asVoid(Deferred.succeed(origin, at)),
        look: (film, post) => one.withPermits(1)(look(film, post)),
      });
    }),
  );
}
