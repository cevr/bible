/** Test-only surface of `@bible/core/wiki`, behind its own subpath.
 *
 *  The Daniel 8 fixture has to be *one* module — §10's Milestone 4 adapter
 *  check is "identical `PhraseSpan` output for the same input text in the web
 *  worker, Electron main, and the Bun CLI — one shared fixture, byte-identical
 *  offsets", and a fixture copied into three suites is three fixtures whose
 *  agreement is a coincidence waiting to end. The CLI's suite lives in another
 *  package, so the fixture cannot live in a `*.test.ts`.
 *
 *  But "importable across packages" is not "part of the product". Exported
 *  through `./wiki`, a verse of Daniel 8 and a five-entry dictionary sit in the
 *  same namespace an app imports `WikiService` from, and nothing stops a
 *  shipped code path from reaching for `PHRASE_FIXTURE_DICTIONARY` when the
 *  real one is unavailable. This subpath is the seam: cross-package tests
 *  import `@bible/core/wiki/testing`, production imports `@bible/core/wiki`,
 *  and the two sets cannot be confused for one another.
 *
 *  Core's own suites import `./phrase-fixture.js` directly — a relative path
 *  inside the package needs no export map entry.
 */

export * from './phrase-fixture.js';
