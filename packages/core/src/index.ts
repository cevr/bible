/**
 * @bible/core - Shared business logic for Bible Tools
 *
 * This package contains the core services and adapters that can be used
 * by both the CLI and web applications.
 *
 * @example
 * ```ts
 * import { discoverProviders } from "@bible/core/ai";
 * import { BIBLE_BOOKS, getBibleBook } from "@bible/core/bible";
 * ```
 */

// Re-export main modules
export * from './ai/index.js';
export * from './bible/index.js';
export * from './hymnal/index.js';
