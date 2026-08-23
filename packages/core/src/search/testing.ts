/** Test-only surface of `@bible/core/search`, behind its own subpath.
 *
 *  §9.7's golden query set has to be *one* module — "one golden query set runs
 *  on web, desktop, and CLI" — and the CLI's suite lives in another package, so
 *  the fixture cannot live in a `*.test.ts`. But "importable across packages" is
 *  not "part of the product": exported through `./search`, a synthetic corpus
 *  would sit in the namespace an app imports `SearchService` from. This subpath
 *  is the seam, exactly as `wiki/testing.ts` is.
 *
 *  Core's own suites import `./golden-fixture.js` directly — a relative path
 *  inside the package needs no export map entry. */

export * from './golden-fixture.js';
