// Export pages, pooled: the one way `check`, `look` and `render` draw a film
// in headless Chromium. `open` builds the export URL for a film page (a film,
// a cut or a short, by its page name), opens a bounded pool of pages on it in
// the caller's scope, and reads the film's info and title once. A call runs on
// whichever page is free; a page whose renderer crashed under it is dropped,
// and the next call opens a fresh one. The scope closing (done, failed or
// interrupted) closes every page.

import { Array as Arr, Context, Effect, Layer, Pool, Predicate, type Scope } from 'effect';
import type { CallAnswers, CallArgs, ExportCall, ExportInfo } from '../core/export-handle.ts';
import { Browser, type CallErrors, type FramePage, type PageOpenError } from './browser.ts';
import type { PageCrashed, PageError } from './errors.ts';
import { PreviewServer } from './preview-server.ts';

/** How a pool of export pages draws. */
export interface PagesOptions {
  /** Pages open at once (at least one). */
  readonly workers: number;
  /** Draw the captions in (`?captions=0` when not). */
  readonly captions: boolean;
}

/** A film page open in `workers` export pages. */
export interface ExportPages {
  readonly info: ExportInfo;
  /** The page's title: the film's (or the short's) title, as the player sets it. */
  readonly title: string;
  /**
   * Run `use` on a free page and hand the page back when it ends; a page
   * that crashed under it is dropped for a fresh one.
   */
  readonly use: <A, E, R>(
    use: (page: FramePage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PageOpenError, R>;
  /** One call of the export handle on a free page (`FramePage.call`). */
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<CallAnswers[K], PageOpenError | PageError | PageCrashed | CallErrors[K]>;
}

interface PagesService {
  /** `film`'s export page (a film's name, a cut's or a short's page name), pooled, in the current scope. */
  readonly open: (
    film: string,
    options: PagesOptions,
  ) => Effect.Effect<ExportPages, PageOpenError, Scope.Scope>;
}

/** The player's export page for `film` on the app's server at `server`. */
export const exportUrl = (server: string, film: string, captions: boolean): string =>
  `${server}?${[
    `film=${encodeURIComponent(film)}`,
    'export',
    ...Arr.filter(['captions=0'], () => !captions),
  ].join('&')}`;

export class Pages extends Context.Service<Pages, PagesService>()('@bible/film/tools/Pages') {
  /** Export pages in the `Browser`, on the app's `PreviewServer`. */
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const server = yield* PreviewServer;

      const open = Effect.fn('Pages.open')(function* (film: string, options: PagesOptions) {
        const pool = yield* Pool.make({
          acquire: browser.open(exportUrl(server.url, film, options.captions)),
          size: Math.max(1, options.workers),
        });
        const use = <A, E, R>(run: (page: FramePage) => Effect.Effect<A, E, R>) =>
          Effect.scoped(
            Effect.flatMap(Pool.get(pool), (page) =>
              run(page).pipe(
                Effect.tapError((error) =>
                  Effect.when(
                    Pool.invalidate(pool, page),
                    Effect.succeed(Predicate.isTagged(error, 'PageCrashed')),
                  ),
                ),
              ),
            ),
          );
        const first = yield* use((page) => Effect.succeed(page));
        yield* Effect.log(`pages.open page=${film} workers=${Math.max(1, options.workers)}`);
        return {
          info: first.info,
          title: first.title,
          use,
          call: <K extends ExportCall>(name: K, ...args: CallArgs[K]) =>
            use((page) => page.call(name, ...args)),
        } satisfies ExportPages;
      });

      return Pages.of({ open });
    }),
  );
}
