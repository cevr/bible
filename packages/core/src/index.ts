/**
 * @bible/core - Shared business logic for Bible Tools
 *
 * This package contains the core services and adapters that can be used
 * by both the CLI and web applications.
 *
 * @example
 * ```ts
 * import { SabbathSchool } from "@bible/core/sabbath-school";
 * import { AiService } from "@bible/core/ai";
 * import { StorageAdapter, ExportAdapter } from "@bible/core/adapters";
 * import { BIBLE_BOOKS, getBibleBook } from "@bible/core/bible";
 * ```
 */

// Re-export main modules
export * from './adapters/index.js';
export * from './ai/index.js';
export * from './sabbath-school/index.js';
export * from './bible/index.js';

// Core services (single source of truth for TUI/web)
export * from './egw-service/index.js';
export * from './hymnal/index.js';
