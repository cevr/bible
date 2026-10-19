// The browser suite's (`test:e2e`) time limit, for a test that sets none of
// its own, on real Chrome workers outside the ten-second budget. A
// browser-free test keeps bun's own 5 s (`preload.ts`). It is set in two
// places, which `test-timeout.test.ts` keeps equal:
//
// - `e2e/preload.ts`, which the script names after the bunfig's preload
//   (bun runs a `--preload` after bunfig's), passes it to effect-bun-test's
//   `setDefaultTimeout`: the deadline its runners hold for the whole
//   process, at which they interrupt a concurrent case (every `.dom.test.ts`
//   file's) and close its scope, its tabs and its lab. A test cannot read
//   `--timeout`, so the runners cannot hold that.
// - The script passes it as `--timeout`: bun keeps a preload's default for a
//   process's first file only, and the script runs several files in a
//   process (`--no-isolate`), so plain `test(...)` calls and hooks in the
//   later files have it from `--timeout`.

/** A browser test's time limit, in milliseconds, unless it sets one of its own. */
export const E2E_TIMEOUT_MS = 20_000;
