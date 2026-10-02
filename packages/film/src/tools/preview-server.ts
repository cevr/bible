// The page the renderer loads: the app's player, served over HTTP for as long
// as a render runs. The framework cannot build it (the app owns its HTML entry
// and its films), so the app hands the `film` CLI a scoped layer for it.

import { Context, type Layer } from 'effect';
import type { LabHandler } from './api-server.ts';

export interface PreviewServerService {
  /** The player's root URL, e.g. `http://localhost:51234/`. */
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@bible/film/tools/PreviewServer',
) {}

/**
 * The app's lab server: a Bun server whose every request `lab` answers (the
 * gate, the lab's API, and its pages as `LabPage` builds them on request).
 * Its URL is the one `film lab` prints.
 */
export type LabServer<E> = (lab: LabHandler) => Layer.Layer<PreviewServer, E>;
