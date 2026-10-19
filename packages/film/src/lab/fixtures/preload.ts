// Preloaded before every film test file (bunfig.toml's `[test] preload`):
// the browser-free tests' time limit, bun's own 5 s, handed to
// effect-bun-test's `setDefaultTimeout`, the deadline its runners hold for
// the whole process, at which they interrupt a concurrent case and close its
// scope. The `test` script names no `--timeout`, so plain `test(...)` calls
// keep bun's own. The browser suite raises it after this, in its own preload
// (`e2e/preload.ts`, `test-timeout.ts`).

import { setDefaultTimeout } from 'effect-bun-test';

/** A browser-free test's time limit, in milliseconds: bun's own default. */
const TEST_TIMEOUT_MS = 5_000;

setDefaultTimeout(TEST_TIMEOUT_MS);
