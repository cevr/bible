/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNodeBuiltinImport, effect/noNullish, effect/noTryCatch, effect/noAs, effect/noTernary -- Playwright's API is promise-based and `page.evaluate` serializes across the browser boundary, so its payloads are structural rather than domain types; this file is a host driver, not Effect code. */

/** §9.5's browser adapter, on a browser with no WebGPU (round-2 F7, browser half).
 *
 *  §9.5 is explicit that the WASM fallback "is not a supported query path": a
 *  300M model on WASM is ~3-7 s per query, and a search box that blocks for
 *  seconds is not a search box. So a browser without WebGPU must **decline** —
 *  `QueryEmbedderUnavailable`, which §9.6 surfaces as the `embedder` absence and
 *  the client degrades to lexical-only.
 *
 *  The risk this guards is specific and silent: transformers.js will happily
 *  fall back to WASM on its own if the device is not pinned. Nothing about the
 *  *results* would look wrong — the same paragraphs come back, ranked the same
 *  way — so the only visible symptom would be a search box that takes seconds,
 *  on the exact machines least able to afford it. No result assertion can catch
 *  that; only asserting the decline can.
 *
 *  Headless Chromium has no WebGPU adapter, which makes the default Playwright
 *  browser the no-WebGPU host this needs — the condition is the harness's own
 *  default rather than something the test has to simulate.
 *
 *  ---
 *
 *  **THIS SPEC CANNOT RUN TODAY, and the reason is not in this file.**
 *
 *  `apps/web` does not boot under Playwright at all. Every one of the five
 *  configured projects (chromium, firefox, webkit, mobile-chrome, mobile-safari)
 *  fails `smoke.spec.ts` identically: `page.goto('/bible/1/1')` renders
 *
 *      The library could not be opened.
 *      An unknown startup error prevented the library from opening.
 *
 *  and no `<h1>` is ever produced. The db worker's OPFS startup fails under the
 *  Playwright browser context, so the application shell renders its startup-error
 *  alert instead of the reader. That failure predates Milestone 8 and is on the
 *  explicit do-not-fix list for this pass.
 *
 *  It blocks *this* spec because the embedder is reached through the same worker
 *  runtime the failing startup owns: there is no page in which `window.claude`-
 *  style access to the search client exists until the library opens. The spec is
 *  therefore written and committed against the contract it must eventually
 *  assert, and skipped at the boot check rather than being allowed to fail for a
 *  reason that has nothing to do with the embedder. When the OPFS boot is fixed,
 *  delete the `test.skip` below and this spec runs as written.
 */

import { expect, test, type Page } from '@playwright/test';

/** Whether the application shell actually opened.
 *
 *  Distinguishes "the library did not open" — the pre-existing OPFS failure —
 *  from "the embedder declined", which is what this spec is about. Without this
 *  the spec would fail red on every run and read as an embedder regression. */
const libraryOpened = async (page: Page): Promise<boolean> => {
  await page.goto('/bible/1/1', { timeout: 60_000 });
  const heading = page.getByRole('heading', { level: 1 });
  return await heading
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
};

test.describe('§9.5 the web worker query embedder', () => {
  test('declines on a browser with no WebGPU rather than falling back to WASM', async ({
    page,
  }) => {
    const opened = await libraryOpened(page);
    test.skip(
      !opened,
      'the web app does not boot under Playwright: the db worker OPFS startup fails and the shell renders "The library could not be opened." This is the pre-existing failure listed in the Milestone 8 brief, not an embedder fault.',
    );

    // WebGPU, as the page itself sees it. Headless Chromium reports no adapter;
    // a headed run on capable hardware may report one, and then the decline
    // under test is not the decline this spec means.
    const hasWebGpu = await page.evaluate(async () => {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } })
        .gpu;
      if (gpu === undefined) return false;
      return (await gpu.requestAdapter()) !== null;
    });
    test.skip(
      hasWebGpu,
      'this browser has a WebGPU adapter, so the no-WebGPU path is not exercised',
    );

    const outcome = await page.evaluate(async () => {
      const { Effect } = await import('effect');
      const { QueryEmbedder, layerBrowserEmbedder } = await import('@bible/core/search');
      const program = Effect.gen(function* () {
        const embedder = yield* QueryEmbedder;
        const vector = yield* embedder.embed('what happens at the close of probation');
        return vector.length;
      }).pipe(Effect.provide(layerBrowserEmbedder));
      return Effect.runPromise(
        Effect.match(program, {
          onSuccess: (length) => ({ declined: false as const, length }),
          onFailure: (error) => ({
            declined: true as const,
            tag: (error as { readonly _tag?: string })._tag ?? '',
            message: String(error),
          }),
        }),
      );
    });

    // The decline, as §9.6's typed absence requires. A success here means
    // transformers.js silently took the WASM path — the failure mode this spec
    // exists for, and the one no result assertion would reveal.
    expect(
      outcome.declined,
      outcome.declined ? '' : 'the embedder returned a vector with no WebGPU: it fell back to WASM',
    ).toBe(true);
    if (!outcome.declined) return;
    expect(outcome.tag).toBe('QueryEmbedderUnavailable');
    // The adapter names itself, which is what makes the diagnostic actionable.
    expect(outcome.message).toContain('web-worker');
  });
});
