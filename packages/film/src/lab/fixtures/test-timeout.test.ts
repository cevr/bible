import { describe, expect, test } from 'bun:test';
import film from '../../../package.json' with { type: 'json' };
import { TEST_TIMEOUT_MS } from './test-timeout.ts';

// The preload's `setDefaultTimeout` lasts for the first file of a process
// only on bun's side, so the scripts that run several files in one process
// (`--no-isolate`) pass the same limit as `--timeout` for the files after it.
describe("the tests' time limit", () => {
  test.each(['test', 'test:e2e'] as const)(
    'the %s script passes TEST_TIMEOUT_MS as --timeout',
    (script) => {
      expect(film.scripts[script]).toContain(` --timeout ${TEST_TIMEOUT_MS} `);
    },
  );
});
