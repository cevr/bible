/**
 * App Runtime - Centralized Effect runtime for TUI
 *
 * Composes all service layers and provides a unified ManagedRuntime.
 * Based on gent's atom-solid pattern.
 */

import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible-service';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { EGWReaderService } from '@bible/core/egw-reader';
import { EGWService } from '@bible/core/egw-service';
import { ensureBibleDb } from '@bible/core/sync';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime } from 'effect';

import type { BibleData } from '../../data/bible/data.js';
import { BibleDataLive } from '../../data/bible/data.js';
import type { BibleState } from '../../data/bible/state.js';
import { BibleStateLive } from '../../data/bible/state.js';

/**
 * All services available in the TUI app runtime
 */
export type AppServices =
  | BibleData
  | BibleState
  | BibleService
  | EGWService
  | EGWReaderService
  | EGWParagraphDatabase
  | BibleDatabase;

/**
 * BibleDatabase layer that ensures bible.db is downloaded before connecting.
 * Uses Layer.unwrapEffect to sequence: sync first, then build the real layer.
 */
const BibleDatabaseWithSync = Layer.unwrap(
  ensureBibleDb.pipe(
    Effect.catch(() => Effect.void),
    Effect.as(BibleDatabase.Default),
  ),
);

/**
 * Combined app layer with all dependencies
 *
 * Layer composition order matters - dependencies go later in provideMerge chain.
 */
export const AppLayer = Layer.mergeAll(
  // Bible services (CLI data layer)
  BibleDataLive,
  BibleStateLive,
  // Core services (unified API)
  BibleService.Default,
  EGWService.Default,
  // EGW reader service
  EGWReaderService.Default,
).pipe(
  Layer.provideMerge(EGWParagraphDatabase.Default),
  Layer.provideMerge(BibleDatabaseWithSync),
  Layer.provideMerge(BunServices.layer),
);

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
 * @example
 * ```tsx
 * const [runtime] = createResource(() => getAppRuntime())
 * ```
 */
export const getAppRuntime = () => appRuntime;

/**
 * Run an effect with the app runtime
 *
 * Convenience wrapper for one-off effect execution.
 */
export const runAppEffect = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> =>
  appRuntime.runPromise(effect);
