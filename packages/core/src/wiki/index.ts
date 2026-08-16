// The Daniel 8 phrase fixture is deliberately absent: it is exported from
// `@bible/core/wiki/testing` (`testing.ts`) so a shipped import cannot reach a
// test dictionary through the same barrel it reaches `WikiService` through.
export * from './model.js';
export * from './normalize.js';
export * from './phrase-matcher.js';
export * from './section-composer.js';
export * from './service-artifact.js';
export * from './service.js';
