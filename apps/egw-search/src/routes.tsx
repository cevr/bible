/** @jsxImportSource effect-frame/view */
// The server imports this file and runs from the repository root, where Bun
// reads no app tsconfig, so the file names its JSX runtime itself.
/**
 * The app's one route tree and its not-found view.
 *
 * Client-safe, and shared: the browser mounts these routes over the server's
 * nodes (`./boot.tsx`), and the server renders its document from the same
 * values (`../server/document.ts`). One definition, so both sides draw the
 * same tree.
 *
 * **Streamed.** A search against a cold corpus can take seconds. The server
 * writes the shell at once — the masthead, every pane's search box with its
 * query, the filters, and each pane's skeleton — then one patch per pane's
 * query as it settles, in the same response. The client hydrates the shell,
 * takes each settled value from the document, and never asks for it again.
 *
 * No declared route data: a pane's query is not a fixed, named declaration.
 * The workspace holds one to `MAX_PANES` panes, a pane with an empty query
 * asks nothing, and each pane debounces its own filter changes. So each pane
 * declares its query in its own setup through `followQuery`, and the streamed
 * shell writes a placeholder for every query the shell declared.
 */

import type { Source } from 'effect-frame/actor/client';
import { Link, NavigationBehavior, Route, link } from 'effect-frame/router';
import { View } from 'effect-frame/view';
import { Effect } from 'effect';

import { SearchPage } from './app.js';
import { search } from './segments.js';

/**
 * **Preserve.** Every move on this route is workspace state on the leaf the
 * reader is already on: a search pushes, a filter replaces, a pane opens or
 * closes. None of them is a new page, so none may scroll the page to the top
 * or take focus to the page root. A new pane's search box places itself
 * (its `Dom.scrollIntoView` and `Dom.focus` in `./app.tsx`); the router has
 * no landing for a node that appears inside a stayed leaf.
 */
export const SearchRoute = Route.streamed(
  'search',
  Route.leaf(search, SearchPage, { landing: NavigationBehavior.Preserve }),
);

export const routes = [SearchRoute];

/** The server sends every unknown path here, so the router is what says a
 *  path is nothing. */
export const NotFound = (props: { readonly url: Source<URL> }) =>
  Effect.gen(function* () {
    // A typed link: the href is printed through the route's own Schemas.
    const home = yield* link(search, {}, {});
    return (
      <div class="shell">
        <header class="masthead">
          <h1>EGW&nbsp;Search</h1>
        </header>
        <div class="status">
          <span>
            nothing at {View.bind(props.url, (url) => url.pathname)} —{' '}
            <Link link={home}>search</Link>
          </span>
        </div>
      </div>
    );
  });
