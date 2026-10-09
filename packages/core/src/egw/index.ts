/**
 * EGW API - Main Export
 *
 * This module provides a complete Effect-TS integration for the EGW (Ellen G. White) Writings API.
 * Adapted from Spotify client patterns with Effect-TS.
 *
 * @example
 * ```ts
 * import { EGWApiClient, EGWAuth } from "~/lib/egw";
 * import { Effect, Layer } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const client = yield* EGWApiClient;
 *   const languages = yield* client.getLanguages;
 *   return languages;
 * });
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Layer.provide(EGWApiClient.Default),
 *     Layer.provide(EGWAuth.Default)
 *   )
 * ).then(console.log);
 * ```
 */

export { nodesToText } from './ast.js';
export { EGWApiClient } from './client.js';
export { EGWAuth } from './auth.js';
export * as Schemas from './schemas.js';
export {
  parseEGWRef,
  formatEGWRef,
  isSearchQuery,
  type EGWParsedRef,
  type EGWParagraphRef,
  type EGWParagraphRangeRef,
  type EGWPageRef,
  type EGWPageRangeRef,
  type EGWBookRef,
  type EGWSearchQuery,
} from './parse.js';
