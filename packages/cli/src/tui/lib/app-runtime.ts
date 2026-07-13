/**
 * App Runtime - Centralized Effect runtime for TUI
 *
 * Composes all service layers and provides a unified ManagedRuntime.
 * Based on gent's atom-solid pattern.
 */

import type { BibleDatabase } from '@bible/core/bible-db';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import { BibleService } from '@bible/core/bible/service';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { StructuralAnalysis } from '@bible/core/structural-analysis';
import { ensureBibleDb } from '@bible/core/sync';
import { WritingsService } from '@bible/core/writings/service';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime } from 'effect';

import type { BibleState } from '../../data/bible/state.js';
import { BibleStateLive } from '../../data/bible/state.js';

/**
 * All services available in the TUI app runtime
 */
export type AppServices =
  | BibleDatabase
  | BibleState
  | BibleService
  | EGWCommentaryService
  | StructuralAnalysis
  | WritingsService;

/**
 * BibleDatabase layer that ensures bible.db is downloaded before connecting.
 * Uses Layer.unwrapEffect to sequence: sync first, then build the real layer.
 */
const BibleDatabaseWithSync = Layer.unwrap(
  ensureBibleDb.pipe(
    Effect.catch(() => Effect.void),
    Effect.as(BibleDbBun.Default),
  ),
);

/**
 * Combined app layer with all dependencies
 *
 * Layer composition order matters - dependencies go later in provideMerge chain.
 */
export const AppLayer = Layer.mergeAll(
  BibleStateLive,
  Layer.merge(BibleService.Live, StructuralAnalysis.Live).pipe(
    Layer.provideMerge(BibleDatabaseWithSync),
  ),
  Layer.merge(WritingsService.Live, EGWCommentaryService.Live).pipe(
    Layer.provide(EGWDbBun.Default),
  ),
).pipe(Layer.provide(BunServices.layer));

/**
 * Managed runtime for the app
 *
 * Usage:
 * ```ts
 * const runtime = await appRuntime.runtime
 * const result = await Runtime.runPromise(runtime)(someEffect)
 * ```
 */
export const appRuntime = ManagedRuntime.make(AppLayer);

/**
 * Get the runtime effect for use with resources
 *
 * Resolve the managed runtime before mounting the TUI tree.
 */
export const getAppRuntime = async () => {
  await appRuntime.runPromise(Effect.void);
  return appRuntime;
};

/**
 * Run an effect with the app runtime
 *
 * Convenience wrapper for one-off effect execution.
 */
export const runAppEffect = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> =>
  appRuntime.runPromise(effect);
