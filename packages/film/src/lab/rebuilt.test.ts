// The page side of live reload: a page waits for newer code than it was
// served, a later build of its server or any build of another server (the
// lab restarted), and reloads once; a wait that fails is asked again after a
// pause, and a wait that answers the same build is asked again.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import type { PageBuild } from '../core/schema.ts';
import { hearEach, reloadPast } from './rebuilt.ts';

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

describe('a review tab hearing its film', () => {
  it.effect(
    'hears each newer answer once, with its build, and asks on from the build it heard',
    () =>
      Effect.gen(function* () {
        const answers: ReadonlyArray<PageBuild> = [
          { build: 4, server: 'a' },
          { build: 5, server: 'a' },
          { build: 5, server: 'a' },
          { build: 9, server: 'a' },
        ];
        const asked: Array<number> = [];
        const heard: Array<number> = [];
        const wait = (at: PageBuild) =>
          Effect.suspend(() => {
            const answer = answers[Math.min(asked.length, answers.length - 1)] ?? at;
            asked.push(at.build);
            return Effect.as(Effect.sleep('1 second'), answer);
          });
        const fiber = yield* hearEach({ build: 4, server: 'a' }, wait, (answer) =>
          Effect.sync(() => {
            heard.push(answer.build);
          }),
        ).pipe(Effect.forkChild);
        for (let i = 0; i < 4; i += 1) yield* TestClock.adjust('1 second');
        yield* Fiber.interrupt(fiber);
        // 5 and 9 are news, each heard with its build; 4 again and 5 again are not.
        expect(heard).toEqual([5, 9]);
        expect(asked.slice(0, 4)).toEqual([4, 4, 5, 5]);
      }),
  );
});
