import { describe, expect, test } from 'bun:test';
import film from '../../../package.json' with { type: 'json' };
import { E2E_TIMEOUT_MS } from './test-timeout.ts';

// The browser-free suite keeps bun's own limit, so its script names none;
// the browser suite raises it in a preload of its own, which lasts for a
// process's first file only on bun's side, so its script passes the same
// limit as `--timeout` for the files after it.
describe("the tests' time limits", () => {
  test('the test script names no --timeout: its limit is bun’s own', () => {
    expect(film.scripts.test).not.toContain('--timeout');
  });

  test('the test:e2e script preloads the browser limit and passes it as --timeout', () => {
    expect(film.scripts['test:e2e']).toContain(' --preload ./e2e/preload.ts ');
    expect(film.scripts['test:e2e']).toContain(` --timeout ${E2E_TIMEOUT_MS} `);
  });
});
