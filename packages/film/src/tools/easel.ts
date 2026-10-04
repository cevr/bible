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

import {
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Scope,
  Semaphore,
} from 'effect';
import {
  type Look,
  LabElsewhere,
  LookFailed,
  type LookPost,
  type LookTaken,
  PagesBroken,
  type PlaceError,
  type SceneTimes,
  lookFileName,
  momentOf,
  viewBox,
} from '../core/easel.ts';
import { UnknownScene } from '../core/errors.ts';
import { Browser, type FramePage } from './browser.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';
import { LabPage } from './lab-page.ts';

/** Why a look drew nothing, each its own tag. */
type LookError = PlaceError | UnknownScene | PagesBroken | LookFailed | LabElsewhere;

interface EaselService {
  /** The lab's own address, once it is bound: the pages a look opens are served there. */
  readonly serve: (origin: string) => Effect.Effect<void>;
  /** `post`'s stills of `film`, drawn from the pages' build as it stands, and written. */
  readonly look: (film: FilmName, post: LookPost) => Effect.Effect<LookTaken, LookError>;
}

/** A film's page held warm: the build it loaded, its scenes' clocks, and the scope it closes with. */
interface Held {
  readonly build: string;
  readonly page: FramePage;
  readonly scenes: ReadonlyArray<SceneTimes>;
  readonly scope: Scope.Closeable;
}

/** The lab's address as its own process reaches it: a wildcard bind is loopback. */
const reachable = (origin: string): string =>
  origin.replace('//0.0.0.0', '//127.0.0.1').replace('//[::]', '//127.0.0.1');

/** `film`'s export page on the lab at `origin`. */
const easelUrl = (origin: string, film: string): string =>
  new URL(`films/${encodeURIComponent(film)}/play?export`, reachable(origin)).href;

/** A page's failure, said as the look's. */
const failedLook = (error: { readonly message: string }) =>
  LookFailed.make({ reason: error.message });

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
      const held = new Map<string, Held>();

      const drop = (film: string) =>
        Option.match(Option.fromUndefinedOr(held.get(film)), {
          onNone: () => Effect.void,
          onSome: (h) =>
            Effect.andThen(
              Effect.sync(() => held.delete(film)),
              Scope.close(h.scope, Exit.void),
            ),
        });

      /** `film`'s page on `build`: the one held, else a fresh one (the old one closed). */
      const pageOn = Effect.fn('Easel.page')(function* (film: string, build: string) {
        const kept = Option.filter(
          Option.fromUndefinedOr(held.get(film)),
          (h) => h.build === build,
        );
        if (Option.isSome(kept)) return kept.value;
        yield* drop(film);
        const at = easelUrl(yield* Deferred.await(origin), film);
        const own = yield* Scope.fork(scope);
        const opened = yield* Effect.gen(function* () {
          const page = yield* Scope.provide(own)(browser.open(at));
          const scenes = yield* page.call('scenes');
          return { build, page, scenes, scope: own } satisfies Held;
        }).pipe(
          Effect.tapError(() => Scope.close(own, Exit.void)),
          Effect.mapError(failedLook),
        );
        held.set(film, opened);
        yield* Effect.log(
          `easel.page.opened film=${film} build=${build} scenes=${opened.scenes.length}`,
        );
        return opened;
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
        const now = yield* pages.built;
        if (Option.isSome(now.failed)) return yield* PagesBroken.make({ reason: now.failed.value });
        const build = `${now.build.server}.${now.build.build}`;
        const builtAt = yield* Clock.currentTimeMillis;
        const page = yield* pageOn(film, build);
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
              .pipe(Effect.tapError(() => drop(film)));
            const file = path.join(dir, lookFileName(moment, post.view, build));
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
          `easel.look film=${film} scene=${scene.id} stills=${looks.length} mode=${post.view.mode} build=${build} ms=${doneAt - started} built_ms=${builtAt - started} page_ms=${pageAt - builtAt} draw_ms=${doneAt - pageAt}`,
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
