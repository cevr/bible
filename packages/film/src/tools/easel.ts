// The easel: a still of a scene as its sources stand, in about a second, with
// no render (`film look`). The lab holds one export page per film warm in
// this process's Chrome (`Browser`) on its own server (the app's render page,
// at the film's export place, `pageHref.export`), and a look seeks it
// to the frame and takes the canvas as the view asks (`still`, the export
// handle's call). Never a stale image: every look first asks the pages'
// build as it stands (`LabPage.built`, which hears a save the watch missed
// and waits out a build under way), refuses a failed build with its words,
// and opens the export page of that very build (`?build=<kept>`), reopening
// it when the build moved, so the page always runs the code on disk. Each still is written once, under the film's
// `out/<film>/look/<scene>/`, named by its time, view and build.
//
// A match (`film match`) draws one frame twice on the same page: once with
// the figure probe on, for each rig's box on screen and its concept, and once
// as a plain PNG, which it crops each figure from; it measures the crop and
// the concept's (`core/figure.ts`), writes the table and the side-by-side
// under `out/<film>/match/<scene>/`, and answers both.
//
// A wedge (`tools/wedge.ts`) draws a look at another level than the one it
// plays: the film's `palette.ts` is read as a pick of that level would write
// it, only in the build (`LabPage.wedge`), and never written. Its page is
// held beside the film's own, a few at most.

import {
  Array as Arr,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Match,
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
  type LookLevelUnknown,
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
import { pageHref } from '../core/api.ts';
import { UnknownScene } from '../core/errors.ts';
import { measureFigure } from '../core/figure.ts';
import {
  type ConceptImage,
  type FigureMark,
  type FigureMatched,
  MatchFigureUnknown,
  type MatchPost,
  type MatchTaken,
  type Unmatched,
  compareFigures,
  conceptImageName,
  figureName,
  matchStem,
  matchTable,
  onFrame,
  sceneBoxOf,
  sideBySide,
} from '../core/match.ts';
import { cropRaster } from '../core/raster.ts';
import type { SourceRefused } from '../core/refusals.ts';
import { Browser, type FramePage } from './browser.ts';
import { FilmFolder, type FilmName, type FilmPaths } from './film-repo.ts';
import { LabPage, type PagesNow } from './lab-page.ts';
import { decodePng, encodePng } from './png.ts';
import { PALETTE_FILE, paletteSwaps } from './wedge.ts';

/** Why a look drew nothing, each its own tag. */
type LookError =
  | PlaceError
  | UnknownScene
  | PagesBroken
  | LookFailed
  | LabElsewhere
  | LookLevelUnknown
  | SourceRefused;

/** Why a match drew nothing, each its own tag. */
type MatchError =
  | PlaceError
  | UnknownScene
  | PagesBroken
  | LookFailed
  | LabElsewhere
  | MatchFigureUnknown;

/** A match's still: the whole frame, plain, as a PNG, captions off. */
const MATCH_VIEW = { mode: 'plain', captions: false, format: 'image/png' } as const;

/** Where a concept image is: a set's file in the out folder beside the film's, a Board try in the film's `board/`. */
const conceptPath = (path: Path.Path, paths: FilmPaths, image: ConceptImage): string =>
  Match.value(image).pipe(
    Match.when({ set: Match.string }, (set) =>
      path.join(path.dirname(paths.out), set.set, set.file),
    ),
    Match.when({ board: Match.string }, (board) => path.join(paths.dir, 'board', board.board)),
    Match.exhaustive,
  );

interface EaselService {
  /** The lab's own address, once it is bound: the pages a look opens are served there. */
  readonly serve: (origin: string) => Effect.Effect<void>;
  /** `post`'s stills of `film`, drawn from the pages' build as it stands (or its wedge), and written. */
  readonly look: (film: FilmName, post: LookPost) => Effect.Effect<LookTaken, LookError>;
  /**
   * `post`'s figures at its place, each measured against its concept:
   * drawn from the pages' build as it stands, its table and side-by-side
   * written.
   */
  readonly match: (film: FilmName, post: MatchPost) => Effect.Effect<MatchTaken, MatchError>;
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

/** The lab's address as its own process reaches it: a wildcard bind is loopback. */
const reachable = (origin: string): string =>
  origin.replace('//0.0.0.0', '//127.0.0.1').replace('//[::]', '//127.0.0.1');

/**
 * `film`'s export page on the lab at `origin`, as the build `kept` made it
 * (`PagesNow.kept`), or of the wedge `wedge` when there is one: never a
 * build made after the one the look was answered.
 */
const easelUrl = (origin: string, film: string, kept: number, wedge: string): string => {
  const pinned = Arr.match(
    Arr.filter([wedge], (w) => w !== ''),
    {
      onEmpty: () => `build=${kept}`,
      onNonEmpty: ([w]) => `wedge=${encodeURIComponent(w)}`,
    },
  );
  return new URL(`${pageHref.export(film)}?${pinned}`, reachable(origin)).href;
};

/** A page's failure, said as the look's. */
const failedLook = (error: { readonly message: string }) =>
  LookFailed.make({ reason: error.message });

/**
 * Whether `folder` is absolute and has no `..` in it: how an asker names its
 * checkout's films folder to the lab (`elsewhereOf`, the MCP's `films`). The
 * lab runs where paths are POSIX.
 */
export const plainAbsolute = (folder: string): boolean =>
  folder.startsWith('/') && !folder.split('/').includes('..');

/**
 * The refusal when the asker's films folder (`from`) is not the one the lab
 * serves `film` from (`dir`, the film's folder there), naming both: a lab
 * answers for its own checkout's files only, never another's under the same
 * film's name. The folders are compared as the file system resolves them,
 * links followed, so a link to the lab's own folder is that folder. Never the
 * lab's: a relative `from` (the lab would resolve it in its own checkout), one
 * with a `..` (Node's `realpath` takes `..` before it follows links, so a
 * link and then `..` would read as the lab's folder while leading to another),
 * and one that is not there. None when they are the one folder.
 */
export const elsewhereOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  from: string,
  film: string,
): Effect.Effect<Option.Option<LabElsewhere>> =>
  Effect.gen(function* () {
    const real = (folder: string) => Effect.option(fs.realPath(folder));
    const lab = path.resolve(dir);
    const served = yield* real(path.dirname(lab));
    const asked = yield* Option.match(Option.liftPredicate(from, plainAbsolute), {
      onNone: () => Effect.succeedNone,
      onSome: real,
    });
    if (Option.isSome(served) && Option.isSome(asked) && served.value === asked.value)
      return Option.none();
    // Named as it resolves, or (not there) as it was given.
    const here = Option.match(asked, {
      onNone: () => `${from.replace(/\/+$/u, '')}/${film}`,
      onSome: (folder) => path.join(folder, film),
    });
    return Option.some(LabElsewhere.make({ lab, here }));
  });

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
        const palette = path.join(folder.paths(film).dir, PALETTE_FILE);
        const swaps = yield* paletteSwaps(fs, palette, levels);
        if (swaps.size === 0) {
          const now: PagesNow = yield* pages.built;
          return { ...now, wedge: '' };
        }
        return yield* pages.wedge(swaps);
      });

      const look = Effect.fn('Easel.look')(function* (film: FilmName, post: LookPost) {
        const started = yield* Clock.currentTimeMillis;
        const paths = folder.paths(film);
        const elsewhere = yield* Option.match(Option.fromUndefinedOr(post.from), {
          onNone: () => Effect.succeedNone,
          onSome: (from) => elsewhereOf(fs, path, paths.dir, from, film),
        });
        if (Option.isSome(elsewhere)) return yield* elsewhere.value;
        const levels = Option.getOrElse(Option.fromUndefinedOr(post.levels), () => ({}));
        const wedge = wedgeName(levels);
        const now = yield* buildFor(film, levels);
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        // The build's own number, not its stamp: a build answered again (a mix since) is the same code.
        const build = [now.build.server, now.kept, ...[now.wedge].filter(Boolean)].join('.');
        const builtAt = yield* Clock.currentTimeMillis;
        const key = [film, ...[wedge].filter(Boolean)].join('?');
        const page = yield* pageOn(
          key,
          build,
          easelUrl(yield* Deferred.await(origin), film, now.kept, now.wedge),
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

      /** The pages' build as the sources stand, or why the look must not draw: another checkout, a failed build. */
      const freshBuild = Effect.fn('Easel.fresh')(function* (
        film: FilmName,
        from: Option.Option<string>,
      ) {
        const paths = folder.paths(film);
        const elsewhere = yield* Option.match(from, {
          onNone: () => Effect.succeedNone,
          onSome: (asked) => elsewhereOf(fs, path, paths.dir, asked, film),
        });
        if (Option.isSome(elsewhere)) return yield* elsewhere.value;
        const now: PagesNow = yield* pages.built;
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        return now;
      });

      const match = Effect.fn('Easel.match')(function* (film: FilmName, post: MatchPost) {
        const started = yield* Clock.currentTimeMillis;
        const paths = folder.paths(film);
        const now = yield* freshBuild(film, Option.fromUndefinedOr(post.from));
        const build = [now.build.server, now.kept].join('.');
        const page = yield* pageOn(
          film,
          build,
          easelUrl(yield* Deferred.await(origin), film, now.kept, ''),
        );
        const scene = yield* Effect.fromOption(
          Option.fromUndefinedOr(page.scenes.find((s) => s.id === post.scene)),
        ).pipe(
          Effect.mapError(() =>
            UnknownScene.make({ scene: post.scene, known: page.scenes.map((s) => s.id) }),
          ),
        );
        const { info } = page.page;
        const moment = yield* Effect.fromResult(momentOf(scene, info.fps, post.at));
        // A page that failed a frame is not trusted with the next: the next look opens a fresh one.
        const drawn = <A, E>(call: Effect.Effect<A, E>) =>
          call.pipe(Effect.tapError(() => drop(film)));
        const marks = (yield* drawn(page.page.call('figures', moment.frame)).pipe(
          Effect.mapError(failedLook),
        )).filter((m) => m.scene === scene.id);
        const asked = Option.fromUndefinedOr(post.figure);
        const named = (m: FigureMark) =>
          Option.match(asked, {
            onNone: () => true,
            onSome: (figure) => figureName(m.key) === figure || m.key === figure,
          });
        const figures = marks.filter((m) => m.face && named(m));
        if (Option.isSome(asked) && figures.length === 0)
          return yield* MatchFigureUnknown.make({
            scene: scene.id,
            figure: asked.value,
            known: marks.filter((m) => m.face).map((m) => figureName(m.key)),
          });
        const png = yield* drawn(page.page.call('still', moment.frame, MATCH_VIEW)).pipe(
          Effect.mapError(failedLook),
        );
        const still = yield* Effect.fromResult(decodePng(png)).pipe(Effect.mapError(failedLook));
        const dir = path.join(paths.out, 'match', scene.id);
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failedLook));
        const place = `${scene.id} ${post.at}, t=${moment.time.toFixed(2)} frame ${moment.frame}, build ${build}`;

        /** One figure held against its concept, or why it cannot be. */
        const matchOne = (mark: FigureMark) =>
          Effect.gen(function* () {
            const name = figureName(mark.key);
            const unmatched = (reason: string) => Result.fail<Unmatched>({ figure: name, reason });
            if (!onFrame(mark, still.width, still.height))
              return unmatched("the frame does not show it: its box lies past the frame's edge");
            const declared = Option.fromUndefinedOr(mark.concept);
            if (Option.isNone(declared)) return unmatched('its rig declares no concept');
            const concept = declared.value;
            const file = conceptPath(path, paths, concept.image);
            const bytes = yield* Effect.result(fs.readFile(file));
            if (Result.isFailure(bytes))
              return unmatched(`its concept ${conceptImageName(concept.image)} is not at ${file}`);
            const image = decodePng(bytes.success);
            if (Result.isFailure(image))
              return unmatched(`its concept ${file}: ${image.failure.message}`);
            const conceptCrop = cropRaster(image.success, concept.box);
            const conceptMeasure = measureFigure(conceptCrop);
            if (Result.isFailure(conceptMeasure))
              return unmatched(`in its concept, ${conceptMeasure.failure.message}`);
            const sceneBox = sceneBoxOf(mark, marks, still.width, still.height);
            const sceneCrop = cropRaster(still, sceneBox);
            const sceneMeasure = measureFigure(sceneCrop);
            if (Result.isFailure(sceneMeasure))
              return unmatched(
                `in the scene (box ${sceneBox.map(Math.round).join(',')}), ${sceneMeasure.failure.message}`,
              );
            const rows = compareFigures(conceptMeasure.success, sceneMeasure.success);
            const stem = path.join(dir, matchStem(name, moment.time, build));
            const side = `${stem}.png`;
            const table = `${stem}.md`;
            yield* fs.writeFile(
              side,
              encodePng(
                sideBySide(
                  { crop: conceptCrop, measure: conceptMeasure.success },
                  { crop: sceneCrop, measure: sceneMeasure.success },
                ),
              ),
            );
            yield* fs.writeFileString(table, matchTable(name, concept, rows, place));
            const crops = { concept: `${stem}.concept.png`, scene: `${stem}.scene.png` };
            yield* fs.writeFile(crops.concept, encodePng(conceptCrop));
            yield* fs.writeFile(crops.scene, encodePng(sceneCrop));
            return Result.succeed<FigureMatched>({
              figure: name,
              key: mark.key,
              concept,
              rows,
              side,
              table,
              crops,
            });
          }).pipe(Effect.mapError(failedLook));
        const results = yield* Effect.forEach(figures, matchOne);
        const matched = Arr.getSuccesses(results);
        const unmatched = Arr.getFailures(results);
        const doneAt = yield* Clock.currentTimeMillis;
        yield* Effect.log(
          `easel.match film=${film} scene=${scene.id} at=${post.at} figures=${matched.length} unmatched=${unmatched.length} build=${build} ms=${doneAt - started}`,
        );
        return {
          build,
          scene: scene.id,
          at: post.at,
          frame: moment.frame,
          time: moment.time,
          figures: matched,
          unmatched,
        } satisfies MatchTaken;
      });

      return Easel.of({
        serve: (at) => Effect.asVoid(Deferred.succeed(origin, at)),
        look: (film, post) => one.withPermits(1)(look(film, post)),
        match: (film, post) => one.withPermits(1)(match(film, post)),
      });
    }),
  );
}
