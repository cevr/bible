// Preloaded before every film test file (bunfig.toml's `[test] preload`):
// the tests' time limit (`test-timeout.ts`), and each worker's Chrome killed
// and its profile removed after its last test, since `bun test` runs no exit
// handler (`chrome-profile.ts`).

// oxlint-disable-next-line effect/noNodeBuiltinImport -- a worker's last word: synchronous, after every test's scope has closed
import { rmSync } from 'node:fs';
import { afterAll } from 'bun:test';
import { setDefaultTimeout } from 'effect-bun-test';
import { PROFILE_ROOT } from '../../tools/chrome-profile.ts';
import { TEST_TIMEOUT_MS } from './test-timeout.ts';

setDefaultTimeout(TEST_TIMEOUT_MS);
// oxlint-disable-next-line effect/noTestLifecycleHooks -- the worker's Chrome outlives every test's scope: its one end is the worker's last test
afterAll(() => {
  Bun.WebView.closeAll();
  rmSync(`${PROFILE_ROOT}/${process.pid}`, { recursive: true, force: true });
});
