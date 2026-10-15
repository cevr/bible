// The channel's relay over a fake lab: its first session takes the cursor
// now; a lab that stops answering is asked again after the wait, and the new
// session reads on from the last cursor seen, never from now (what changed
// while it was away is told). The lost session is ended, and the last one
// when the relay stops.

import { Effect, Fiber, Option, Queue } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';
import type { LabChanges } from './lab-events.ts';
import { relayFeed } from './lab-relay.ts';

const answer = (cursor: string): LabChanges => ({ cursor, changes: [], reset: false });

describe("the channel's relay", () => {
  it.effect('reads on from the last cursor after the lab stops answering', () =>
    Effect.gen(function* () {
      const asked: Array<string> = [];
      const lost: Array<string> = [];
      const ended: Array<string> = [];
      const told = yield* Queue.unbounded<string>();
      let sessions = 0;
      // What the lab answers each call, in turn: the cursor now, one change, gone; then it is back.
      const script: Array<Effect.Effect<LabChanges, string>> = [
        Effect.succeed(answer('c0')),
        Effect.succeed(answer('c1')),
        Effect.fail('the lab restarted'),
        Effect.succeed(answer('c2')),
      ];
      const fiber = yield* Effect.forkChild(
        relayFeed(
          {
            session: Effect.acquireRelease(
              Effect.sync(() => {
                sessions += 1;
                return `s${sessions}`;
              }),
              (session) => Effect.sync(() => ended.push(session)),
            ),
            changes: (session, since, wait) => {
              asked.push(`${session} ${Option.getOrElse(since, () => 'now')} ${wait}`);
              return Option.getOrElse(Option.fromUndefinedOr(script.shift()), () => Effect.never);
            },
          },
          (a) => Queue.offer(told, a.cursor),
          (error) => Effect.sync(() => lost.push(error)),
          { wait: 50, retry: '5 seconds' },
        ),
      );
      expect(yield* Queue.take(told)).toBe('c1');
      yield* TestClock.adjust('5 seconds');
      expect(yield* Queue.take(told)).toBe('c2');
      expect(asked).toEqual(['s1 now 0', 's1 c0 50', 's1 c1 50', 's2 c1 50', 's2 c2 50']);
      expect(lost).toEqual(['the lab restarted']);
      expect(ended).toEqual(['s1']);
      yield* Fiber.interrupt(fiber);
      expect(ended).toEqual(['s1', 's2']);
    }),
  );
});
