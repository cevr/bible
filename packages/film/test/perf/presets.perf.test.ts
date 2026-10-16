// The recipes' ports (core/synth/graph/presets.ts) render within 1.5× their
// recipe's time, and each family renders a one-second one-shot in under
// 20 ms. Local only (`bun run test:perf`), never the gate: a stopwatch reads
// the machine as much as the code, and a CI runner ran the film's CPU tests
// 17–35× slower than a laptop. Each pair is timed in one run at the app's
// settings, a recipe's render and its port's in turn, seven warm runs a side
// after one to warm up, so the machine's load falls on both alike; a family
// is timed the same way, seven warm runs on seven seeds. The medians are
// logged for the report.

import { Clock, Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { defineLibrary } from '../../src/core/sfx.ts';
import type { Node } from '../../src/core/synth/graph/nodes.ts';
import {
  burst,
  hiss,
  knock,
  scatter,
  sizzle,
  thump,
  whoosh,
} from '../../src/core/synth/graph/presets.ts';
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

/** Each one-shot family at one second long. */
const ONE_SECOND: ReadonlyArray<readonly [string, Node]> = [
  ['burst', burst({ color: 'pink', low: 500, high: 2000, attack: 0.0005, decay: 1 })],
  ['thump', thump({ hz: 100, octaves: 1, drop: 0.02, decay: 1 })],
  ['knock', knock({ material: 'wood', hz: 480, secs: 1 })],
  [
    'scatter',
    scatter({ count: 4, first: 0.025, every: 0.17, fall: 6, material: 'stone', hz: 600, secs: 1 }),
  ],
  ['whoosh', whoosh({ onset: 0.05, hit: 0.5, fall: 0.5, low: 1200, high: 6000, q: 0.5 })],
  ['hiss', hiss({ hz: 8500, q: 1.2, rise: 0.3, hold: 0.8, secs: 1 })],
  ['sizzle', sizzle({ flash: 0.05, crackle: 120, secs: 1 })],
];

/** The budget for a one-second one-shot on this laptop, in milliseconds. */
const ONE_SHOT_MS = 20;

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

describe(`each family renders a one-second one-shot in under ${ONE_SHOT_MS} ms`, () => {
  for (const [family, play] of ONE_SECOND)
    it.live(family, () =>
      Effect.gen(function* () {
        const library = defineLibrary({
          'family.timed': { kind: 'code', sound: { play }, variants: RUNS, use: 'one-shot' },
        });
        const sound = Result.getOrThrow(resolveCode(library)).code.get('family.timed')!;
        const once = renderCode(sound, 1);
        expect(once.frames).toBe(once.rate);
        const times: Array<number> = [];
        for (let seed = 1; seed <= RUNS; seed++)
          times.push(yield* timed(() => renderCode(sound, seed)));
        yield* Effect.logInfo(`perf.family family=${family} ms=${median(times).toFixed(1)}`);
        expect(median(times)).toBeLessThan(ONE_SHOT_MS);
      }),
    );
});
