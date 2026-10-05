// The page the renderer and the check load: the app's render page (its
// player and its films), on a loopback server of its own for as long as a
// `render` or `check` runs, so neither needs a lab up. The app owns the page
// and serves it (Bun bundles its HTML entry, `serve` in the app's
// `server.ts`); the `film` CLI takes that server as a scoped layer.

import { Context } from 'effect';

interface PreviewServerService {
  /** The player's root URL, e.g. `http://localhost:51234/`. */
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@bible/film/tools/PreviewServer',
) {}
