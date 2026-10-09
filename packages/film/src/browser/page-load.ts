// A page loaded anew: the lab's reload onto new code or a new take (at the
// place its URL keeps), and another of the server's pages opened from code:
// a move to another part or film that the page cannot make within itself
// (`lab/page-shell.tsx`: the page bar's keys, a film card's menu, the film
// switcher), and Scenes' Open in Lab (`lab/scenes/view.tsx`). A move within a page
// is `@bible/url-state`'s (`UrlState`); this is for the moves that load one.
// The live adapter is `page-load-browser.ts`.

import { Context, type Effect } from 'effect';

interface PageLoadOps {
  /** Load this page again, at the URL it is on. */
  readonly reload: Effect.Effect<void>;
  /** Load the page at `href`, as a followed link does (Back returns). */
  readonly open: (href: string) => Effect.Effect<void>;
}

export class PageLoad extends Context.Service<PageLoad, PageLoadOps>()(
  '@bible/film/browser/PageLoad',
) {}
