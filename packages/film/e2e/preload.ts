// Preloaded by the browser suite (`test:e2e`'s `--preload`), after the
// bunfig's `src/lab/fixtures/preload.ts`: the browser tests' time limit
// (`src/lab/fixtures/test-timeout.ts`).

import { setDefaultTimeout } from 'effect-bun-test';
import { E2E_TIMEOUT_MS } from '../src/lab/fixtures/test-timeout.ts';

setDefaultTimeout(E2E_TIMEOUT_MS);
