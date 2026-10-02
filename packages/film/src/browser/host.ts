// The page's host: the browser APIs a page reaches (animation frames, the
// pointer, the keyboard, media elements) as Effect services, built once at
// each page's root (`mountPlayer`, `mountLab`, `mountReview`) from
// `BrowserHost.layer` (`host-browser.ts`) and handed to everything on the
// page: the player's own code runs its effects with it, and the lab's and
// review's runtimes are given it as a layer, so a test builds the same pages
// over test layers instead of stubbing a global. Framework-free: the player,
// which the render page loads, imports it.

import { Effect, Layer, Scope } from 'effect';
import type { Context } from 'effect';
import type { Keys } from './keys.ts';
import type { Pointer } from './pointer.ts';

/** Every service the host gives a page. */
export type BrowserServices = Keys | Pointer;

/** The host's services, built: what a page's code runs its effects with. */
export type Host = Context.Context<BrowserServices>;

/**
 * The host `layer` builds (the page's, or a test's over its own layers), for
 * the life of the page: its scope is never closed, as the page is the host's
 * lifetime.
 */
export const hostOf = <S>(layer: Layer.Layer<S>): Context.Context<S> =>
  Effect.runSync(Effect.flatMap(Scope.make(), (scope) => Layer.buildWithScope(layer, scope)));

/** The host as a layer, for a runtime the page builds (the lab's, the studio's, the review's). */
export const hostLayer = (host: Host): Layer.Layer<BrowserServices> => Layer.succeedContext(host);
