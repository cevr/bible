// The time limit of every film test that sets none of its own, browser-free
// and E2E alike. `preload.ts` (bunfig.toml's `[test] preload`) sets it
// through effect-bun-test's `setDefaultTimeout`, in place of `bun test
// --timeout`, which a test cannot read: so it is bun's default timeout and
// the deadline effect-bun-test's runners hold, at which they interrupt a
// concurrent case (every `.dom.test.ts` file's) and close its scope, its
// tabs and its lab, instead of letting it run on beside the cases after it.

/** A test's time limit, in milliseconds, unless it sets one of its own. */
export const TEST_TIMEOUT_MS = 20_000;
