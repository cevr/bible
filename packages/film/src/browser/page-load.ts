// A page loaded anew: the lab's reload onto new code or a new take (at the
// place its URL keeps), and another of the server's pages opened from code:
// the header's film switcher, when the page cannot make the move within
// itself (`lab/page-shell.tsx`), and Scenes' Open in Lab
// (`lab/scenes/view.tsx`). A move within a page
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
