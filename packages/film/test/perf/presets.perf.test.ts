// The presets (core/synth/graph/presets.ts) render a second of sound in under
// 20 ms: each tone at the app's settings, rain and the breeze as long as a
// bed, and each one-shot family as a one-second one-shot. Local only
// (`bun run test:perf`), never the gate: a stopwatch reads the machine as
// much as the code, and a CI runner ran the film's CPU tests 17–35× slower
// than a laptop. Each preset is timed in seven warm runs on seven seeds after
// one to warm up; the medians are logged for the report.

import { Clock, Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { defineLibrary } from '../../src/core/sfx.ts';
import type { Node } from '../../src/core/synth/graph/nodes.ts';
import {
  bloom,
  breeze,
  burst,
  chime,
  drain,
  drone,
  hiss,
  knock,
  notes,
  rain,
  room,
  scatter,
  sizzle,
  thump,
  whoosh,
} from '../../src/core/synth/graph/presets.ts';
import { renderCode } from '../../src/core/synth/graph/render.ts';
import { resolveCode } from '../../src/core/synth/resolve.ts';

/** The tones as the app declares them, rain and the breeze as long as a bed, and each one-shot family at one second long. */
const TIMED: ReadonlyArray<readonly [string, Node]> = [
  ['room', room({ secs: 8 })],
  ['chime', chime({ root: 'D5', partials: 'glass', secs: 1.5 })],
  ['drone', drone({ root: 'D2', secs: 8 })],
  ['drain', drain({ from: 'D4', to: 'A2', secs: 1.5 })],
  ['bloom', bloom({ root: 'D4', secs: 2.5 })],
  ['notes', notes({ root: 'D5', count: 4, secs: 1.5 })],
  ['rain', rain({ secs: 8, hiss: 900, taps: 10 })],
  ['breeze', breeze({ secs: 8, hz: 550 })],
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

/** The budget for a second of sound on this laptop, in milliseconds. */
const PER_SECOND_MS = 20;

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

describe(`each preset renders a second of sound in under ${PER_SECOND_MS} ms`, () => {
  for (const [preset, play] of TIMED)
    it.live(preset, () =>
      Effect.gen(function* () {
        const library = defineLibrary({
          'preset.timed': { kind: 'code', sound: { play }, variants: RUNS, use: 'one-shot' },
        });
        const sound = Result.getOrThrow(resolveCode(library)).code.get('preset.timed')!;
        const once = renderCode(sound, 1);
        const secs = once.frames / once.rate;
        const times: Array<number> = [];
        for (let seed = 1; seed <= RUNS; seed++)
          times.push(yield* timed(() => renderCode(sound, seed)));
        const perSecond = median(times) / secs;
        yield* Effect.logInfo(
          `perf.preset preset=${preset} secs=${secs.toFixed(2)} ms=${median(times).toFixed(1)} ms_per_second=${perSecond.toFixed(1)}`,
        );
        expect(perSecond).toBeLessThan(PER_SECOND_MS);
      }),
    );
});
