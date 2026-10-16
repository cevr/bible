// The Board section's writes (`board.json` through the lab's board routes):
// a try kept, a beat approved, an approval withdrawn, one at a time. A write
// asked while another is on its way is not sent (none is sent twice); a
// landed one carries the board as the write left it, a refused one the
// lab's words, said until the next write.
//
//   Idle | Done | Failed ─Keep | Approve | Withdraw→ Sending{write}
//   Sending ─Landed{board}→ Done{write, board}
//   Sending ─Refused{reason}→ Failed{write, reason}
//   Sending hears no other write.
//
// Beside it, what the section shows of a beat's board as it stands
// (`beatBoard`): its panels in order, each with its tries and the one kept,
// whether the beat is approved, and whether Approve can land now (the
// board's own rule, `approveBeat`), so the button says why not before it
// is pressed. Nothing here touches the DOM or the lab: the send is the
// provider's effect, faked in tests.

import { Effect, Match, Option, Result, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import {
  BoardFile,
  type Panel,
  approvalOf,
  approveBeat,
  boardNamed,
  panelsOf,
} from '../../core/board.ts';

/** One write the Board section asks of the lab. */
export const BoardWrite = Schema.Union([
  Schema.TaggedStruct('Keep', { panel: Schema.String, n: Schema.Int }),
  Schema.TaggedStruct('Approve', { beat: Schema.String }),
  Schema.TaggedStruct('Withdraw', { beat: Schema.String }),
]);
export type BoardWrite = typeof BoardWrite.Type;

/** What a write is called while it is on its way, and once it landed. */
const writeWords = (write: BoardWrite): { readonly sending: string; readonly done: string } =>
  Match.value(write).pipe(
    Match.tagsExhaustive({
      Keep: (w) => ({ sending: `Keeping try ${w.n}…`, done: `Kept try ${w.n} of ${w.panel}` }),
      Approve: (w) => ({ sending: `Approving ${w.beat}…`, done: `Approved ${w.beat}` }),
      Withdraw: (w) => ({ sending: 'Withdrawing the approval…', done: `Withdrew ${w.beat}` }),
    }),
  );

export const BoardWritesState = State({
  Idle: {},
  /** `write` is on its way. */
  Sending: { write: BoardWrite },
  /** `write` landed; `board` is the board it left. */
  Done: { write: BoardWrite, board: BoardFile },
  /** `write` was refused: the lab's `reason`. */
  Failed: { write: BoardWrite, reason: Schema.String },
});
export type BoardWritesState = typeof BoardWritesState.Type;

export const BoardWritesEvent = Event({
  /** Keep try `n` of panel `panel`. */
  Keep: { panel: Schema.String, n: Schema.Int },
  /** Approve beat `beat`'s board. */
  Approve: { beat: Schema.String },
  /** Withdraw beat `beat`'s approval. */
  Withdraw: { beat: Schema.String },
  /** The write landed: the board it left. */
  Landed: { board: BoardFile },
  /** The write was refused: why. */
  Refused: { reason: Schema.String },
});
export type BoardWritesEvent = typeof BoardWritesEvent.Type;

/** The states a write may be asked in: any but Sending. */
const READY = [BoardWritesState.Idle, BoardWritesState.Done, BoardWritesState.Failed] as const;

/** The writes machine over `send` (the board a write leaves, or the lab's reason it refused). */
const boardWritesMachine = <R>(send: (write: BoardWrite) => Effect.Effect<BoardFile, string, R>) =>
  Machine.make({
    state: BoardWritesState,
    event: BoardWritesEvent,
    initial: BoardWritesState.Idle,
  })
    .on(READY, BoardWritesEvent.Keep, ({ event }) =>
      BoardWritesState.Sending({ write: { _tag: 'Keep', panel: event.panel, n: event.n } }),
    )
    .on(READY, BoardWritesEvent.Approve, ({ event }) =>
      BoardWritesState.Sending({ write: { _tag: 'Approve', beat: event.beat } }),
    )
    .on(READY, BoardWritesEvent.Withdraw, ({ event }) =>
      BoardWritesState.Sending({ write: { _tag: 'Withdraw', beat: event.beat } }),
    )
    .task(
      BoardWritesState.Sending,
      ({ state }) =>
        send(state.write).pipe(
          Effect.map((board) => BoardWritesEvent.Landed({ board })),
          Effect.catch((reason) => Effect.succeed(BoardWritesEvent.Refused({ reason }))),
        ),
      { onSuccess: (event) => event },
    )
    .on(BoardWritesState.Sending, BoardWritesEvent.Landed, ({ state, event }) =>
      BoardWritesState.Done({ write: state.write, board: event.board }),
    )
    .on(BoardWritesState.Sending, BoardWritesEvent.Refused, ({ state, event }) =>
      BoardWritesState.Failed({ write: state.write, reason: event.reason }),
    );

/** The writes machine's actor, started, idle, sending through `send`. */
export const spawnBoardWrites = <R>(
  send: (write: BoardWrite) => Effect.Effect<BoardFile, string, R>,
) => Machine.spawn(boardWritesMachine(send)).pipe(Effect.tap((actor) => actor.start));

export type BoardWritesActor = Effect.Success<ReturnType<typeof spawnBoardWrites<never>>>;

/** What a writes state says on the page: the write on its way, landed or refused; nothing while idle. */
export const writesLine = (state: BoardWritesState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Idle: () => Option.none<string>(),
      Sending: (s) => Option.some(writeWords(s.write).sending),
      Done: (s) => Option.some(writeWords(s.write).done),
      Failed: (s) => Option.some(`Not saved: ${s.reason}`),
    }),
  );

/** A beat's board as the Board section shows it. */
export interface BeatBoard {
  /** Its panels in the film's order. */
  readonly panels: ReadonlyArray<Panel>;
  /** Approved as its panels stand, approved on tries since changed, or not. */
  readonly approval: 'none' | 'approved' | 'stale';
  /** Whether Approve can land now, else the board's own reason it cannot. */
  readonly approvable: Result.Result<void, string>;
}

/** Beat `beat`'s board in `board`, as the section shows it. */
export const beatBoard = (board: BoardFile, beat: string): BeatBoard => ({
  panels: panelsOf(board, beat),
  approval: approvalOf(board, beat),
  approvable: Option.match(boardNamed(beat), {
    onNone: () => Result.fail(`${beat} is not a board beat name`),
    onSome: (name) =>
      Result.match(approveBeat(board, name, ''), {
        onSuccess: () => Result.void,
        onFailure: (refusal) => Result.fail(refusal.reason),
      }),
  }),
});
