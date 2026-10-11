// The page render's workers on Bun: Effect's `BunWorker`, spawning each
// build's worker from `page-render-worker.ts` with the host's `Worker`
// constructor. The one place the render reaches that global, so the one file
// `effect/noGlobals` exempts as an adapter (`.oxlintrc.json`).

import { BunWorker } from '@effect/platform-bun';

/** The workers a build's renders run in: each a Bun worker of `page-render-worker.ts`. */
export const renderWorkers = BunWorker.layer(
  () => new globalThis.Worker(new URL('./page-render-worker.ts', import.meta.url)),
);
