// The memory highlights a test reads: what a name paints is the last ranges
// painted as it, and a cleared name paints nothing.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { CodeRange } from '../core/schema.ts';
import { type HighlightName, Highlights } from './highlights.ts';

describe('highlights in memory', () => {
  it.effect('paint replaces what a name painted, and clear paints nothing', () => {
    const painted = new Map<HighlightName, ReadonlyArray<CodeRange>>();
    const node = {} as Text;
    return Effect.gen(function* () {
      const highlights = yield* Highlights;
      yield* highlights.paint('lab-live', node, [[0, 3]]);
      yield* highlights.paint('lab-live', node, [[4, 9]]);
      yield* highlights.paint('lab-read', node, [[10, 12]]);
      expect([...painted]).toEqual([
        ['lab-live', [[4, 9]]],
        ['lab-read', [[10, 12]]],
      ]);
      yield* highlights.clear('lab-live');
      expect([...painted.keys()]).toEqual(['lab-read']);
    }).pipe(Effect.provide(Highlights.memory(painted)));
  });
});
