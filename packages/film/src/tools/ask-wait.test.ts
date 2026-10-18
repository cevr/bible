// `film ask wait`'s latch over a fake lab: an ask answered before the wait
// ends it at once; one answered later is heard through the feed and read
// again; a step's latch ends on that step; a lab that drops is asked again
// and read on from the last cursor; a `reset` reads the asks again (a lab
// restarted saw the answer as its baseline); `--any` counts only an ask
// answered after it began; an unknown ask and a timeout are typed failures.
// What it held on prints a line each, every answer typed, words quoted so a
// newline cannot split a line.

import { Duration, Effect, Exit, Fiber, Logger, Option, Result, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';
import type { LabChange } from '../core/lab-events.ts';
import type { AskRead } from './asks-mcp.ts';
import { AskLatch, type AskFeed, askLines, waitForAsk } from './ask-wait.ts';
import type { LabChanges } from './lab-events.ts';

const PACE = { wait: 50, retry: Schedule.spaced('1 second'), sayEvery: '1 minute' } as const;

const read = (ask: string, status: AskRead['status'], steps: ReadonlyArray<string> = []) =>
  ({
    ask,
    title: `the ${ask}`,
    by: 'agent',
    status,
    answers: {},
    answered: steps.map((step) => ({ step, at: '2026-10-17T12:00:00.000Z' })),
    links: { local: `http://127.0.0.1:8229/asks/${ask}` },
  }) satisfies AskRead;

/** A lab that did not answer, in its words. */
interface Lost {
  readonly message: string;
}

const change = (ask: string, kind: LabChange['kind']): LabChange => ({
  seq: 1,
  at: '2026-10-17T12:00:00.000Z',
  kind,
  ask,
  summary: `${kind} ${ask}`,
  links: { local: 'http://127.0.0.1:8229/' },
});

const ok = Result.succeed;
const lost = Result.fail;

/** The feed's answer past a cursor, as the fake lab gives it. */
const answer = (
  cursor: string,
  changes: ReadonlyArray<LabChange> = [],
  reset = false,
): Result.Result<LabChanges, string> => ok({ cursor, changes, reset });

/** The asks, as the fake lab lists them. */
const listed = (...asks: ReadonlyArray<AskRead>): Result.Result<ReadonlyArray<AskRead>, string> =>
  ok(asks);

/**
 * A fake lab: `changes` answers its script in turn (then never), `asks` its
 * own (then its last again); every call is written down as `<session>
 * <what>`. A failed step is a lost lab, in its words.
 */
const fakeLab = (
  changes: Array<Result.Result<LabChanges, string>>,
  asks: Array<Result.Result<ReadonlyArray<AskRead>, string>>,
) => {
  const calls: Array<string> = [];
  let sessions = 0;
  let lastAsks = Option.none<ReadonlyArray<AskRead>>();
  const step = <A>(script: Array<Result.Result<A, string>>, last: Option.Option<A>) =>
    Option.match(Option.fromUndefinedOr(script.shift()), {
      onNone: () => Option.match(last, { onNone: () => Effect.never, onSome: Effect.succeed }),
      onSome: (next) => Effect.mapError(Effect.fromResult(next), (message): Lost => ({ message })),
    });
  const feed: AskFeed<string, Lost> = {
    session: Effect.sync(() => {
      sessions += 1;
      return `s${sessions}`;
    }),
    changes: (session, since, wait) => {
      calls.push(`${session} changes ${Option.getOrElse(since, () => 'now')} ${wait}`);
      return step(changes, Option.none());
    },
    asks: (session) => {
      calls.push(`${session} asks`);
      const next = step(asks, lastAsks);
      return Effect.tap(next, (read) =>
        Effect.sync(() => {
          lastAsks = Option.some(read);
        }),
      );
    },
  };
  return { feed, calls };
};

describe("film ask wait's latch", () => {
  it.effect('ends at once on an ask answered before it began', () =>
    Effect.gen(function* () {
      const lab = fakeLab([answer('e.0')], [listed(read('a1', 'answered'))]);
      const got = yield* waitForAsk(
        lab.feed,
        AskLatch.One({ ask: 'a1', step: Option.none() }),
        PACE,
        Option.none(),
      );
      expect(got.status).toBe('answered');
      expect(lab.calls).toEqual(['s1 changes now 0', 's1 asks']);
    }),
  );

  it.effect('hears a later answer on the feed, reading the asks again only when it moved', () =>
    Effect.gen(function* () {
      const lab = fakeLab(
        [
          answer('e.0'),
          answer('e.1', [change('other', 'ask.answered')]),
          answer('e.2', [change('a1', 'ask.answered')]),
        ],
        [listed(read('a1', 'asking')), listed(read('a1', 'answered'))],
      );
      const got = yield* waitForAsk(
        lab.feed,
        AskLatch.One({ ask: 'a1', step: Option.none() }),
        PACE,
        Option.none(),
      );
      expect(got.status).toBe('answered');
      expect(lab.calls).toEqual([
        's1 changes now 0',
        's1 asks',
        's1 changes e.0 50',
        's1 changes e.1 50',
        's1 asks',
      ]);
    }),
  );

  it.effect('ends on one step answered while the ask still asks', () =>
    Effect.gen(function* () {
      const lab = fakeLab(
        [
          answer('e.0'),
          answer('e.1', [change('a1', 'ask.step')]),
          answer('e.2', [change('a1', 'ask.step')]),
        ],
        [
          listed(read('a1', 'asking')),
          listed(read('a1', 'asking', ['intro'])),
          listed(read('a1', 'asking', ['intro', 'board'])),
        ],
      );
      const got = yield* waitForAsk(
        lab.feed,
        AskLatch.One({ ask: 'a1', step: Option.some('board') }),
        PACE,
        Option.none(),
      );
      expect(got.answered.map((a) => a.step)).toEqual(['intro', 'board']);
    }),
  );

  it.effect('reads on from the last cursor after the lab drops', () =>
    Effect.gen(function* () {
      const lab = fakeLab(
        [
          answer('e.0'),
          answer('e.1'),
          lost('the lab restarted'),
          answer('e.2', [change('a1', 'ask.answered')]),
        ],
        [
          listed(read('a1', 'asking')),
          lost('gone'),
          listed(read('a1', 'asking')),
          listed(read('a1', 'answered')),
        ],
      );
      const fiber = yield* Effect.forkChild(
        waitForAsk(lab.feed, AskLatch.One({ ask: 'a1', step: Option.none() }), PACE, Option.none()),
      );
      yield* TestClock.adjust('10 seconds');
      const got = yield* Fiber.join(fiber);
      expect(got.status).toBe('answered');
      expect(lab.calls).toEqual([
        's1 changes now 0',
        's1 asks',
        's1 changes e.0 50',
        's1 changes e.1 50',
        's2 asks',
        's3 asks',
        's3 changes e.1 50',
        's3 asks',
      ]);
    }),
  );

  it.effect('never ends for a lab that does not answer, saying so once a minute', () => {
    const lines: Array<string> = [];
    return Effect.gen(function* () {
      let tries = 0;
      const feed: AskFeed<string, Lost> = {
        session: Effect.suspend(() => {
          tries += 1;
          return Effect.fail({ message: 'refused' });
        }),
        changes: () => Effect.never,
        asks: () => Effect.never,
      };
      const fiber = yield* Effect.forkChild(
        waitForAsk(feed, AskLatch.One({ ask: 'a1', step: Option.none() }), PACE, Option.none()),
      );
      yield* TestClock.adjust('150 seconds');
      expect(fiber.pollUnsafe()).toBeUndefined();
      expect(tries).toBeGreaterThan(100);
      expect(lines.filter((l) => l.startsWith('[ask] wait lab=unreachable'))).toHaveLength(3);
      yield* Fiber.interrupt(fiber);
    }).pipe(
      Effect.provide(
        Logger.layer([
          Logger.make(({ message }) => {
            lines.push([message].flat().join(' '));
          }),
        ]),
      ),
    );
  });

  it.effect(
    'reads the asks again on a reset: the restarted lab saw the answer as its baseline',
    () =>
      Effect.gen(function* () {
        const lab = fakeLab(
          [answer('e.0'), answer('f.0', [], true)],
          [listed(read('a1', 'asking')), listed(read('a1', 'answered'))],
        );
        const got = yield* waitForAsk(
          lab.feed,
          AskLatch.One({ ask: 'a1', step: Option.none() }),
          PACE,
          Option.none(),
        );
        expect(got.status).toBe('answered');
        expect(lab.calls.at(-1)).toBe('s1 asks');
      }),
  );

  it.effect('counts with --any only an ask answered after it began, of its production', () =>
    Effect.gen(function* () {
      const old = { ...read('a0', 'answered'), production: 'rbf' };
      const lab = fakeLab(
        [
          answer('e.0'),
          answer('e.1', [change('a2', 'ask.answered')]),
          answer('e.2', [change('a1', 'ask.answered')]),
        ],
        [
          listed(old, { ...read('a1', 'asking'), production: 'rbf' }, read('a2', 'asking')),
          listed(old, { ...read('a1', 'asking'), production: 'rbf' }, read('a2', 'answered')),
          listed(old, { ...read('a1', 'answered'), production: 'rbf' }, read('a2', 'answered')),
        ],
      );
      const got = yield* waitForAsk(
        lab.feed,
        AskLatch.Any({ production: Option.some('rbf') }),
        PACE,
        Option.none(),
      );
      expect(got.ask).toBe('a1');
    }),
  );

  it.effect('fails on an ask the lab does not have, naming it', () =>
    Effect.gen(function* () {
      const lab = fakeLab([answer('e.0')], [listed(read('a1', 'asking'))]);
      const exit = yield* Effect.exit(
        waitForAsk(
          lab.feed,
          AskLatch.One({ ask: 'nope', step: Option.none() }),
          PACE,
          Option.none(),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain('the lab has no ask "nope"');
    }),
  );

  it.effect('fails as ask.wait.timeout once its timeout passes', () =>
    Effect.gen(function* () {
      const lab = fakeLab([answer('e.0')], [listed(read('a1', 'asking'))]);
      const fiber = yield* Effect.forkChild(
        Effect.exit(
          waitForAsk(
            lab.feed,
            AskLatch.One({ ask: 'a1', step: Option.none() }),
            PACE,
            Option.some(Duration.minutes(5)),
          ),
        ),
      );
      yield* TestClock.adjust('5 minutes');
      const exit = yield* Fiber.join(fiber);
      expect(String(exit)).toContain('ask.wait.timeout: no answer after 5m');
    }),
  );
});

describe("film ask wait's lines", () => {
  it.effect('prints the ask, each step answered, each answer typed and its links', () =>
    Effect.sync(() => {
      expect(
        askLines({
          ask: 'a1',
          title: 'Which board?',
          by: 'orchestrator',
          status: 'closed',
          answers: {
            pick: { kind: 'choose', value: 'k1', label: 'K1, the cut paper' },
            why: { kind: 'free_text', text: 'warmer\nand plainer' },
            more: { kind: 'skipped' },
          },
          answered: [{ step: 'board', at: '2026-10-17T12:00:00.000Z' }],
          closed: 'acted on',
          links: {
            local: 'http://127.0.0.1:8229/asks/a1',
            phone: 'http://100.92.183.50:8230/asks/a1',
          },
        }),
      ).toEqual([
        'ask a1 status=closed by=orchestrator title="Which board?"',
        'answered step=board at=2026-10-17T12:00:00.000Z',
        'answer pick choose value=k1 label="K1, the cut paper"',
        'answer why free_text text="warmer\\nand plainer"',
        'answer more skipped',
        'closed why="acted on"',
        'local http://127.0.0.1:8229/asks/a1',
        'phone http://100.92.183.50:8230/asks/a1',
      ]);
    }),
  );
});
