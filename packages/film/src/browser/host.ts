// The page's host: the browser APIs a page reaches (animation frames, the
// pointer, the keyboard, media elements) as Effect services, built once at
// each page's root (`mountPlayer`, `mountLab`, `mountReview`) from
// `BrowserHost.layer` (`host-browser.ts`) and handed to everything on the
// page: the player's own code runs its effects with it, and the lab's and
// review's runtimes are given it as a layer, so a test builds the same pages
// over test layers instead of stubbing a global. Framework-free: the player,
// which the render page loads, imports it.

import { Clock, Effect, Exit, Layer, Scope } from 'effect';
import type { Context } from 'effect';
import type { Frames } from './frames.ts';
import type { Keys } from './keys.ts';
import type { Media } from './media.ts';
import type { Pointer } from './pointer.ts';

/** Every service the host gives a page. */
export type BrowserServices = Frames | Keys | Media | Pointer;

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

/** A scoped effect run: its value, and the close of its scope. */
interface Scoped<A> {
  readonly value: A;
  readonly close: () => void;
}

/**
 * Run a scoped `effect` on `host` now, in a scope of its own: its value, and
 * the scope's close (a component's cleanup) to release what it holds.
 */
export const runScoped =
  <S>(host: Context.Context<S>) =>
  <A>(effect: Effect.Effect<A, never, S | Scope.Scope>): Scoped<A> => {
    const scope = Scope.makeUnsafe();
    const value = Effect.runSyncWith(host)(Scope.provide(scope)(effect));
    return { value, close: () => Effect.runFork(Scope.close(scope, Exit.void)) };
  };

/**
 * A reader of the monotonic time of `host`'s `Clock`, in ms (the page's
 * `performance.now` live, a test's clock in a test): for a hot path, such as
 * the play loop, that reads it every frame.
 */
export const monotonicMs = <S>(host: Context.Context<S>): (() => number) => {
  const clock = Effect.runSyncWith(host)(Clock.clockWith(Effect.succeed));
  return () => Number(clock.monotonicTimeNanosUnsafe()) / 1e6;
};
