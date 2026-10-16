// The recipes' ports (core/synth/graph/presets.ts) render within 1.5× their
// recipe's time. Local only (`bun run test:perf`), never the gate: a
// stopwatch reads the machine as much as the code, and a CI runner ran the
// film's CPU tests 17–35× slower than a laptop. Each pair is timed in one
// run at the app's settings, a recipe's render and its port's in turn, seven
// warm runs a side after one to warm up, so the machine's load falls on both
// alike; the medians are logged for the report.

import { Clock, Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { defineLibrary } from '../../src/core/sfx.ts';
import { renderCode } from '../../src/core/synth/graph/render.ts';
import { type Recipe, synthesize } from '../../src/core/synth/recipes.ts';
import { resolveCode } from '../../src/core/synth/resolve.ts';

/** The recipes as the app declares them, and wind and rain (declared by none) as long as a bed. */
const AT_APP: ReadonlyArray<Recipe> = [
  { recipe: 'room', secs: 8 },
  { recipe: 'bell', root: 'D5', partials: 'glass', secs: 1.5 },
  { recipe: 'drone', root: 'D2', secs: 8 },
  { recipe: 'drain', from: 'D4', to: 'A2', secs: 1.5 },
  { recipe: 'bloom', root: 'D4', secs: 2.5 },
  { recipe: 'notes', root: 'D5', count: 4, secs: 1.5 },
  { recipe: 'wind', secs: 8 },
  { recipe: 'rain', secs: 8 },
];

const RUNS = 7;

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** How long `render` takes, in milliseconds, on the live clock. */
const timed = (render: () => unknown) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeNanos;
    render();
    return Number((yield* Clock.currentTimeNanos) - start) / 1e6;
  });

describe('each port renders within 1.5× its recipe’s time', () => {
  for (const recipe of AT_APP)
    it.live(recipe.recipe, () =>
      Effect.gen(function* () {
        const library = defineLibrary({
          'tone.port': { kind: 'procedural', recipe, variants: RUNS, use: 'one-shot' },
        });
        const sound = Result.getOrThrow(resolveCode(library)).trials.get('tone.port')!.sound;
        synthesize(recipe, 1);
        renderCode(sound, 1);
        const recipeTimes: Array<number> = [];
        const portTimes: Array<number> = [];
        for (let seed = 1; seed <= RUNS; seed++) {
          recipeTimes.push(yield* timed(() => synthesize(recipe, seed)));
          portTimes.push(yield* timed(() => renderCode(sound, seed)));
        }
        const ratio = median(portTimes) / median(recipeTimes);
        yield* Effect.logInfo(
          `perf.port recipe=${recipe.recipe} recipe_ms=${median(recipeTimes).toFixed(1)} port_ms=${median(portTimes).toFixed(1)} ratio=${ratio.toFixed(2)}`,
        );
        expect(ratio).toBeLessThanOrEqual(1.5);
      }),
    );
});
