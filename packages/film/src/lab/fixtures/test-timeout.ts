// The time limit of every film test that sets none of its own, browser-free
// and E2E alike. It is set in two places, which `test-timeout.test.ts`
// keeps equal:
//
// - `preload.ts` (bunfig.toml's `[test] preload`) passes it to
//   effect-bun-test's `setDefaultTimeout`: the deadline effect-bun-test's
//   runners hold for the whole process, at which they interrupt a concurrent
//   case (every `.dom.test.ts` file's) and close its scope, its tabs and its
//   lab, instead of letting it run on beside the cases after it. A test
//   cannot read `--timeout`, so the runners cannot hold that.
// - The `test` and `test:e2e` scripts pass it as `--timeout`: bun keeps the
//   preload's half (bun's own default) for a process's first file only, and
//   the scripts run several files in a process (`--no-isolate`), so plain
//   `test(...)` calls and hooks in the later files have it from `--timeout`.

/** A test's time limit, in milliseconds, unless it sets one of its own. */
export const TEST_TIMEOUT_MS = 20_000;
