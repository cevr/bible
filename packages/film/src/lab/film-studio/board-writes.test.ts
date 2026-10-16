// The Board section's writes, with no page: a try kept, a beat approved and
// its approval withdrawn, each sent once through the provider's send; one
// asked while another is on its way is not sent; a landed write carries the
// board it left, a refused one the lab's words. And a beat's board as the
// section shows it: its panels, its approval, and why Approve cannot land.

import { Array as Arr, Deferred, Effect, Exit, Option, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  type BoardFile,
  BoardName,
  type BoardTry,
  type Panel,
  emptyBoard,
} from '../../core/board.ts';
import { Segment } from '../../core/segment.ts';
import {
  type BoardWrite,
  BoardWritesEvent,
  BoardWritesState,
  beatBoard,
  spawnBoardWrites,
  writesLine,
} from './board-writes.ts';

const COLD = BoardName.make('cold');

const tried = (n: number): BoardTry => ({
  n,
  file: Segment.make(`cold.start.${n}.png`),
  sha256: `sha${n}`,
  made: 'generate',
  prompt: 'p',
  refs: [],
  at: '2026-10-16T00:00:00.000Z',
});

const panel = (at: string, tries: number, kept: Option.Option<number>): Panel => ({
  id: `cold.${at}`,
  beat: COLD,
  at: BoardName.make(at),
  tries: Arr.makeBy(tries, (i) => tried(i + 1)),
  ...Option.match(kept, { onNone: () => ({}), onSome: (k) => ({ kept: k }) }),
});

const board = (...panels: ReadonlyArray<Panel>): BoardFile => ({ ...emptyBoard('rbf'), panels });

const KEPT = board(panel('start', 2, Option.some(2)));

describe("the Board section's writes", () => {
  it.effect('sends a try kept once, and holds the board it left', () => {
    const sent: Array<BoardWrite> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnBoardWrites((write) =>
        Effect.sync(() => {
          sent.push(write);
          return KEPT;
        }),
      );
      yield* actor.send(BoardWritesEvent.Keep({ panel: 'cold.start', n: 2 }));
      const done = yield* actor.waitFor((s) => s._tag === 'Done');
      expect(done).toEqual(
        BoardWritesState.Done({ write: { _tag: 'Keep', panel: 'cold.start', n: 2 }, board: KEPT }),
      );
      expect(sent).toEqual([{ _tag: 'Keep', panel: 'cold.start', n: 2 }]);
      expect(writesLine(done)).toEqual(Option.some('Kept try 2 of cold.start'));
    }).pipe(Effect.scoped);
  });

  it.effect('sends no write asked while another is on its way', () => {
    const sent: Array<BoardWrite> = [];
    return Effect.gen(function* () {
      const held = yield* Deferred.make<void>();
      const actor = yield* spawnBoardWrites((write) =>
        Effect.suspend(() => {
          sent.push(write);
          return Effect.as(Deferred.await(held), KEPT);
        }),
      );
      yield* actor.send(BoardWritesEvent.Approve({ beat: 'cold' }));
      const sending = yield* actor.waitFor((s) => s._tag === 'Sending');
      expect(writesLine(sending)).toEqual(Option.some('Approving cold…'));
      yield* actor.send(BoardWritesEvent.Withdraw({ beat: 'cold' }));
      yield* Deferred.done(held, Exit.void);
      const done = yield* actor.waitFor((s) => s._tag === 'Done');
      expect(done._tag === 'Done' && done.write).toEqual({ _tag: 'Approve', beat: 'cold' });
      expect(sent).toEqual([{ _tag: 'Approve', beat: 'cold' }]);
    }).pipe(Effect.scoped);
  });

  it.effect("says a refused write in the lab's words, and sends the next one asked", () => {
    const sent: Array<BoardWrite> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnBoardWrites((write) =>
        Effect.suspend(() => {
          sent.push(write);
          return Effect.fail('pick a try of cold.start first');
        }),
      );
      yield* actor.send(BoardWritesEvent.Approve({ beat: 'cold' }));
      const failed = yield* actor.waitFor((s) => s._tag === 'Failed');
      expect(writesLine(failed)).toEqual(Option.some('Not saved: pick a try of cold.start first'));
      yield* actor.send(BoardWritesEvent.Withdraw({ beat: 'cold' }));
      yield* actor.waitFor((s) => s._tag === 'Failed' && s.write._tag === 'Withdraw');
      expect(sent.map((w) => w._tag)).toEqual(['Approve', 'Withdraw']);
    }).pipe(Effect.scoped);
  });
});

describe("a beat's board as the section shows it", () => {
  it.effect('lists its panels and lets Approve land once each keeps a try', () =>
    Effect.sync(() => {
      const shown = beatBoard(KEPT, 'cold');
      expect(shown.panels.map((p) => p.id)).toEqual(['cold.start']);
      expect(shown.approval).toBe('none');
      expect(Result.isSuccess(shown.approvable)).toBe(true);
    }),
  );

  it.effect("says the board's own reason Approve cannot land", () =>
    Effect.sync(() => {
      const unkept = beatBoard(board(panel('start', 2, Option.none())), 'cold');
      expect(unkept.approvable).toEqual(Result.fail('pick a try of cold.start first'));
      expect(beatBoard(KEPT, 'job').approvable).toEqual(
        Result.fail('beat job has no panel yet: make its board first'),
      );
      expect(beatBoard(KEPT, 'not a name').approvable).toEqual(
        Result.fail('not a name is not a board beat name'),
      );
    }),
  );

  it.effect('reads an approval as it stands, and one whose tries changed since as stale', () =>
    Effect.sync(() => {
      const approved: BoardFile = {
        ...KEPT,
        approvals: [{ beat: COLD, kept: [{ panel: 'cold.start', try: 2 }], at: 'now' }],
      };
      expect(beatBoard(approved, 'cold').approval).toBe('approved');
      const changed: BoardFile = { ...approved, panels: [panel('start', 2, Option.some(1))] };
      expect(beatBoard(changed, 'cold').approval).toBe('stale');
    }),
  );
});
