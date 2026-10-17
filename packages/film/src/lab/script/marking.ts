// A reader's one write, a beat's delivery marks (`POST …/script/marks`, or a
// draft's own route), one at a time. A write asked while another is on its
// way is not sent (none is sent twice); a landed one says so on its beat, a
// refused one the lab's words, until the next write.
//
//   Idle | Written | Failed ─Mark{write}→ Writing{beat, write}
//   Writing ─Landed→ Written{beat}
//   Writing ─Refused{reason}→ Failed{beat, reason}
//   Writing hears no other Mark.
//
// Nothing here touches the DOM or the lab: the send is the reader's effect
// (what a landed write leaves on the page is its own), faked in tests.

import { Effect, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { MarksPost } from '../../core/api.ts';
import { Mark } from '../../core/delivery.ts';

/** One write of marks: the post the lab is sent, and the beat's marks as the page read them. */
export const MarkWrite = Schema.Struct({ post: MarksPost, read: Schema.Array(Mark) });
export type MarkWrite = typeof MarkWrite.Type;

export const MarkingState = State({
  Idle: {},
  /** `write`, of beat `beat`'s marks, is on its way. */
  Writing: { beat: Schema.String, write: MarkWrite },
  /** Beat `beat`'s marks landed. */
  Written: { beat: Schema.String },
  /** Beat `beat`'s marks were refused: the lab's `reason`. */
  Failed: { beat: Schema.String, reason: Schema.String },
});
export type MarkingState = typeof MarkingState.Type;

export const MarkingEvent = Event({
  /** Write `write`. */
  Mark: { write: MarkWrite },
  /** The write landed. */
  Landed: {},
  /** The write was refused: why. */
  Refused: { reason: Schema.String },
});
export type MarkingEvent = typeof MarkingEvent.Type;

/** The states a write may be asked in: any but Writing. */
const READY = [MarkingState.Idle, MarkingState.Written, MarkingState.Failed] as const;

/** The marking machine over `send` (done once the write landed, or the lab's reason it refused). */
const markingMachine = <R>(send: (write: MarkWrite) => Effect.Effect<void, string, R>) =>
  Machine.make({ state: MarkingState, event: MarkingEvent, initial: MarkingState.Idle })
    .on(READY, MarkingEvent.Mark, ({ event }) =>
      MarkingState.Writing({ beat: event.write.post.beat, write: event.write }),
    )
    .task(
      MarkingState.Writing,
      ({ state }) =>
        send(state.write).pipe(
          Effect.as(MarkingEvent.Landed),
          Effect.catch((reason) => Effect.succeed(MarkingEvent.Refused({ reason }))),
        ),
      { onSuccess: (event) => event },
    )
    .on(MarkingState.Writing, MarkingEvent.Landed, ({ state }) =>
      MarkingState.Written({ beat: state.beat }),
    )
    .on(MarkingState.Writing, MarkingEvent.Refused, ({ state, event }) =>
      MarkingState.Failed({ beat: state.beat, reason: event.reason }),
    );

/** The marking machine's actor, started, idle, writing through `send`. */
export const spawnMarking = <R>(send: (write: MarkWrite) => Effect.Effect<void, string, R>) =>
  Machine.spawn(markingMachine(send)).pipe(Effect.tap((actor) => actor.start));
