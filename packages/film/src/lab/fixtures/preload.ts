// Preloaded before every film test file (bunfig.toml's `[test] preload`):
// the tests' time limit (`test-timeout.ts`).

import { setDefaultTimeout } from 'effect-bun-test';
import { TEST_TIMEOUT_MS } from './test-timeout.ts';

setDefaultTimeout(TEST_TIMEOUT_MS);
