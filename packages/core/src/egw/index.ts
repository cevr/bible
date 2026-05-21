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
 *   const languages = yield* client.getLanguages();
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

export {
  Node,
  type Text,
  type LineBreak,
  type PageBreak,
  type Emphasis,
  type Comment,
  type ScriptureRef,
  type BookRef,
  type Unknown,
  parseParagraphContent,
  nodesToText,
} from './ast.js';
export {
  EGWApiClient,
  type EGWApiClientService,
  EGWApiError,
  type EGWApiClientError,
} from './client.js';
export { EGWAuth, EGWAuthError, AccessToken } from './auth.js';
export { EGWTokenStore } from './token-store.js';
export * as Schemas from './schemas.js';
export {
  parseEGWRef,
  parseEGWRefEffect,
  formatEGWRef,
  isReference,
  isSearchQuery,
  getBookCode,
  buildRefcodePattern,
  chapterIdFromTocItem,
  isChapterHeading,
  headingLevel,
  EGWParseError,
  type EGWParsedRef,
  type EGWParagraphRef,
  type EGWParagraphRangeRef,
  type EGWPageRef,
  type EGWPageRangeRef,
  type EGWBookRef,
  type EGWSearchQuery,
} from './parse.js';
