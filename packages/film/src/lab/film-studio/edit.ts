// The studio's one edit in flight, as a machine: a Script clip lifted and
// carried over the gaps between the beats (a drop on a gap that moves it is
// a move, any other is none), a clip's edge gripped and pulled (its hold
// snapped and kept inside its floors as it is pulled; let go anywhere but
// where it began is a hold), and an ask from a key, a menu or a receipt (a
// move before a beat picked, an Undo or a Redo of the film's history). One
// write at a time: an ask while one is on its way, or while the version
// is read again after one landed, is not taken, and a press then lifts
// nothing. A landed write names what it did; a refused one says why, until
// the next edit.
//
//   Idle | Done | Failed ─Lift→ Dragging ─Over→ Dragging ─Drop (a gap that moves it)→ Sending{Move}
//                                         ─Drop (no move) | Cancel→ Idle
//   Idle | Done | Failed ─Grip→ Trimming ─Pull→ Trimming ─Let (moved)→ Sending{Hold}
//                                         ─Let (where it began) | Cancel→ Idle
//   Idle | Done | Failed ─Ask→ Sending
//   Sending ─Landed (a change)→ Landed ─Read→ Done
//   Sending ─Landed (nothing changed)→ Done ; Sending ─Refused→ Failed
//
// What an edit shows before the lab has read the version again
// (`previewOf`): a trim as it is pulled, a write on its way, and a write
// landed until the version's read holds it, laid on the timeline by
// `ripple.ts`. Nothing here touches the DOM or the lab: the
// write is the provider's effect, faked in tests.

import { Effect, Match, Option, Predicate, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { StudioEdit } from '../../core/api.ts';
import { beforeGap, dropMoves, heldWithin } from '../../core/beat-edit.ts';
import { ChangeId } from '../../core/schema.ts';
import type { Preview } from './ripple.ts';

const Edge = Schema.Literals(['lead', 'tail']);

/** An edit the page asks the lab for: a move, a hold, or a step of the film's history. */
export const StudioAsk = Schema.Union([
  Schema.TaggedStruct('Move', { beat: Schema.String, before: Schema.Option(Schema.String) }),
  /** A hold set from `from` (as it stood) to `seconds`. */
  Schema.TaggedStruct('Hold', {
    beat: Schema.String,
    edge: Edge,
    from: Schema.Finite,
    seconds: Schema.Finite,
  }),
  /** Undo or Redo; of the one change `change` names (a receipt's), else the newest. */
  Schema.TaggedStruct('Step', {
    verb: Schema.Literals(['undo', 'redo']),
    change: Schema.Option(ChangeId),
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type StudioAsk = typeof StudioAsk.Type;

export const EditState = State({
  Idle: {},
  /** Script clip `beat` lifted, over gap `gap` (the index of the beat it would go before), of the beats `ids`. */
  Dragging: {
    beat: Schema.String,
    ids: Schema.Array(Schema.String),
    gap: Schema.Option(Schema.Int),
  },
  /** Beat `beat`'s `edge` gripped: its hold `from` as it stood, `to` as it is pulled. */
  Trimming: { beat: Schema.String, edge: Edge, from: Schema.Finite, to: Schema.Finite },
  /** `ask` is on its way. */
  Sending: { ask: StudioAsk },
  /** `ask` was written: what the lab answered, shown until the version is read again. */
  Landed: { ask: StudioAsk, answer: StudioEdit },
  /** `ask` landed and the version was read again, or it changed nothing: what the lab answered. */
  Done: { ask: StudioAsk, answer: StudioEdit },
  /** `ask` was refused: the lab's words. */
  Failed: { ask: StudioAsk, reason: Schema.String },
});
export type EditState = typeof EditState.Type;

export const EditEvent = Event({
  Lift: { beat: Schema.String, ids: Schema.Array(Schema.String) },
  /** Carried over gap `gap`, or off the beats (none). */
  Over: { gap: Schema.Option(Schema.Int) },
  Drop: {},
  Grip: { beat: Schema.String, edge: Edge, from: Schema.Finite },
  /** Pulled to `to` seconds of hold, as the pointer asks it (snapped here). */
  Pull: { to: Schema.Finite },
  Let: {},
  Cancel: {},
  Ask: { ask: StudioAsk },
  Landed: { answer: StudioEdit },
  Refused: { reason: Schema.String },
  /** The version was read again after a write landed (or the read failed, the timeline shown kept). */
  Read: {},
});
export type EditEvent = typeof EditEvent.Type;

/** The states an edit may start in: at rest. */
const READY = [EditState.Idle, EditState.Done, EditState.Failed] as const;

/** The edit machine over `send` (the lab's answer to an ask, or its words refusing it). */
const editMachine = <R>(send: (ask: StudioAsk) => Effect.Effect<StudioEdit, string, R>) =>
  Machine.make({ state: EditState, event: EditEvent, initial: EditState.Idle })
    .on(READY, EditEvent.Lift, ({ event }) =>
      EditState.Dragging({ beat: event.beat, ids: event.ids, gap: Option.none() }),
    )
    .on(EditState.Dragging, EditEvent.Over, ({ state, event }) =>
      EditState.Dragging({ ...state, gap: event.gap }),
    )
    .on(EditState.Dragging, EditEvent.Drop, ({ state }) =>
      Option.match(
        Option.filter(state.gap, (gap) => dropMoves(state.ids, state.beat, gap)),
        {
          onNone: (): EditState => EditState.Idle,
          onSome: (gap) =>
            EditState.Sending({
              ask: StudioAsk.cases.Move.make({
                beat: state.beat,
                before: beforeGap(state.ids, gap),
              }),
            }),
        },
      ),
    )
    .on(READY, EditEvent.Grip, ({ event }) =>
      EditState.Trimming({ beat: event.beat, edge: event.edge, from: event.from, to: event.from }),
    )
    .on(EditState.Trimming, EditEvent.Pull, ({ state, event }) =>
      EditState.Trimming({ ...state, to: heldWithin(state.edge, event.to, state.from) }),
    )
    .on(EditState.Trimming, EditEvent.Let, ({ state }) =>
      Option.match(
        Option.liftPredicate(state, (s) => s.to !== s.from),
        {
          onNone: (): EditState => EditState.Idle,
          onSome: (s) =>
            EditState.Sending({
              ask: StudioAsk.cases.Hold.make({
                beat: s.beat,
                edge: s.edge,
                from: s.from,
                seconds: s.to,
              }),
            }),
        },
      ),
    )
    .on([EditState.Dragging, EditState.Trimming], EditEvent.Cancel, () => EditState.Idle)
    .on(READY, EditEvent.Ask, ({ event }) => EditState.Sending({ ask: event.ask }))
    .task(
      EditState.Sending,
      ({ state }) =>
        send(state.ask).pipe(
          Effect.map((answer) => EditEvent.Landed({ answer })),
          Effect.catch((reason) => Effect.succeed(EditEvent.Refused({ reason }))),
        ),
      { onSuccess: (event) => event },
    )
    .on(EditState.Sending, EditEvent.Landed, ({ state, event }) =>
      Option.match(Option.fromUndefinedOr(event.answer.change), {
        onNone: (): EditState => EditState.Done({ ask: state.ask, answer: event.answer }),
        onSome: () => EditState.Landed({ ask: state.ask, answer: event.answer }),
      }),
    )
    .on(EditState.Landed, EditEvent.Read, ({ state }) =>
      EditState.Done({ ask: state.ask, answer: state.answer }),
    )
    .on(EditState.Sending, EditEvent.Refused, ({ state, event }) =>
      EditState.Failed({ ask: state.ask, reason: event.reason }),
    );

/** The edit machine's actor, started, at rest, writing through `send`. */
export const spawnEdit = <R>(send: (ask: StudioAsk) => Effect.Effect<StudioEdit, string, R>) =>
  Machine.spawn(editMachine(send)).pipe(Effect.tap((actor) => actor.start));

export type EditActor = Effect.Success<ReturnType<typeof spawnEdit<never>>>;

/** What `ask` shows on the timeline before the lab reads it again: a move or a hold; a step shows nothing. */
const askPreview = (ask: StudioAsk): Option.Option<Preview> =>
  Match.value(ask).pipe(
    Match.tagsExhaustive({
      Move: (m): Option.Option<Preview> =>
        Option.some({ _tag: 'Move', beat: m.beat, before: m.before }),
      Hold: (h): Option.Option<Preview> =>
        Option.some({ _tag: 'Hold', beat: h.beat, edge: h.edge, from: h.from, to: h.seconds }),
      Step: () => Option.none(),
    }),
  );

/**
 * What the edit in `state` shows before the lab reads the version again: a
 * trim as it is pulled, a write on its way, a write landed until the read
 * that holds it; none at rest or while a clip is carried (its drop line
 * shows where it would go).
 */
export const previewOf = (state: EditState): Option.Option<Preview> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Idle: () => Option.none<Preview>(),
      Dragging: () => Option.none<Preview>(),
      Trimming: (t): Option.Option<Preview> =>
        Option.some({ _tag: 'Hold', beat: t.beat, edge: t.edge, from: t.from, to: t.to }),
      Sending: (s) => askPreview(s.ask),
      Landed: (l) => askPreview(l.ask),
      Done: () => Option.none<Preview>(),
      Failed: () => Option.none<Preview>(),
    }),
  );

/** Whether an edit can start in `state`: none is in hand, on its way, or landed and not yet read again. */
export const atRest: (state: EditState) => boolean = Predicate.or(
  Predicate.isTagged('Idle'),
  Predicate.or(Predicate.isTagged('Done'), Predicate.isTagged('Failed')),
);
