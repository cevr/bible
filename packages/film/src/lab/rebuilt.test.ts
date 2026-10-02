// The page side of live reload: a page waits for newer code than it was
// served, a later build of its server or any build of another server (the
// lab restarted), and reloads once; a wait that fails is asked again after a
// pause, and a wait that answers the same build is asked again.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import type { PageBuild } from '../core/api.ts';
import { reloadPast } from './rebuilt.ts';

/** A wait whose answers are scripted: a build, or a failure (the server unreachable). */
type Answer = PageBuild | 'unreachable';

/**
 * `reloadPast` over a wait answering `answers` in turn (the last one again
 * after the script runs out): how many times it reloaded and what it asked.
 */
const run = (served: PageBuild, answers: ReadonlyArray<Answer>) =>
  Effect.gen(function* () {
    const asked: Array<PageBuild> = [];
    let reloads = 0;
    const wait = (at: PageBuild) =>
      Effect.suspend(() => {
        const answer = answers[Math.min(asked.length, answers.length - 1)] ?? 'unreachable';
        asked.push(at);
        if (answer === 'unreachable') return Effect.fail('unreachable');
        // The server holds a wait until it has news; a second here.
        return Effect.as(Effect.sleep('1 second'), answer);
      });
    const fiber = yield* reloadPast(
      served,
      wait,
      Effect.sync(() => {
        reloads += 1;
      }),
    ).pipe(Effect.forkChild);
    // Each failed wait is asked again after 2 s; ten pauses cover every script here.
    for (let i = 0; i < 10; i += 1) yield* TestClock.adjust('2 seconds');
    return { reloads, asked, fiber };
  });

describe('a page onto new code', () => {
  it.effect('asks again while its own build answers, and reloads once on a later one', () =>
    Effect.gen(function* () {
      const served = { build: 4, server: 'a' };
      const { reloads, asked } = yield* run(served, [served, served, { build: 5, server: 'a' }]);
      expect(reloads).toBe(1);
      expect(asked).toEqual([served, served, served]);
    }),
  );

  it.effect("reloads on another server's first build, though its number is lower", () =>
    Effect.gen(function* () {
      const { reloads, asked } = yield* run({ build: 7, server: 'a' }, [{ build: 0, server: 'b' }]);
      expect(reloads).toBe(1);
      expect(asked).toHaveLength(1);
    }),
  );

  it.effect(
    'a wait that fails is asked again after a pause, and the recovered server reloads it',
    () =>
      Effect.gen(function* () {
        const served = { build: 2, server: 'a' };
        const { reloads, asked } = yield* run(served, [
          'unreachable',
          'unreachable',
          { build: 0, server: 'b' },
        ]);
        expect(reloads).toBe(1);
        expect(asked).toHaveLength(3);
      }),
  );

  it.effect('never reloads while its own server answers its own build', () =>
    Effect.gen(function* () {
      const served = { build: 3, server: 'a' };
      const { reloads, asked, fiber } = yield* run(served, [served]);
      expect(reloads).toBe(0);
      expect(asked.length).toBeGreaterThan(10);
      yield* Fiber.interrupt(fiber);
    }),
  );
});
