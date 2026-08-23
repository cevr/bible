// The golden query set is deliberately absent: it is exported from
// `@bible/core/search/testing` (`testing.ts`) so a shipped import cannot reach
// a ten-paragraph fixture corpus through the same barrel it reaches
// `SearchService` through — the seam `wiki/index.ts` draws for the same reason.
export * from './embedder.js';
export * from './fusion.js';
export * from './model.js';
export * from './router.js';
export * from './service.js';
export * from './vector-artifact.js';
export * from './vector-bytes-fs.js';
export * from './vector-index.js';
