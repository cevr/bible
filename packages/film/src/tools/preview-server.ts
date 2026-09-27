// The page the renderer loads: the app's player, served over HTTP for as long
// as a render runs. The framework cannot build it (the app owns its HTML entry
// and its films), so the app hands the `film` CLI a scoped layer for it.

import { Context, type Layer } from 'effect';
import type { LabHandler } from './lab.ts';

export interface PreviewServerService {
  /** The player's root URL, e.g. `http://localhost:51234/`. */
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@bible/film/tools/PreviewServer',
) {}

/**
 * The app's lab server: its player in development mode (the bundle rebuilds
 * and hot-reloads as scenes change), with the lab's API mounted at `/lab/*`.
 * Its URL is the one `film lab` prints.
 */
export type LabServer<E> = (lab: LabHandler) => Layer.Layer<PreviewServer, E>;
