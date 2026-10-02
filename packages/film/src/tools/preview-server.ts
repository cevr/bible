// The page the renderer loads: the app's player, served over HTTP for as long
// as a render runs. The framework cannot build it (the app owns its HTML entry
// and its films), so the app hands the `film` CLI a scoped layer for it.

import { Context } from 'effect';

interface PreviewServerService {
  /** The player's root URL, e.g. `http://localhost:51234/`. */
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@bible/film/tools/PreviewServer',
) {}
