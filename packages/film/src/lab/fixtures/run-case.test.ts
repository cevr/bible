// `runCase` with no browser: a case bun ends while its effect still runs (as
// a timeout ends one) has that effect interrupted, and its finalizers run,
// before the next case starts. The two cases run in order (a unit file's
// cases are not concurrent).

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { runCase } from './run-case.ts';

describe('a case run by runCase', () => {
  const seen: Array<string> = [];

  test('ends while its effect still runs, holding a resource', () => {
    void runCase(
      Effect.scoped(
        Effect.andThen(
          Effect.acquireRelease(
            Effect.sync(() => seen.push('acquired')),
            () => Effect.sync(() => seen.push('released')),
          ),
          Effect.never,
        ),
      ),
    );
  });

  test('has that effect interrupted when bun ends it, its finalizers run before this case', () => {
    expect(seen).toEqual(['acquired', 'released']);
  });
});
