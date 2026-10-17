// A note the inspector saves: on a Board panel, the owner's words and the
// marks he drew on the try shown, as a note or a tweak (the panel made
// again by an agent, his marks its reference); on a line's words, as a
// note, a correction (`replace`: the words to say instead) or a removal.
// One save at a time: a save asked while another is on its way is not
// sent; a landed one names the note it filed, a refused one the lab's
// words, said until the next save.
//
//   Idle | Saved | Failed ─Save{ask, text, replace, sketch}→ Saving{ask, text, replace, sketch}
//   Saving ─Landed{id}→ Saved{ask, id}
//   Saving ─Refused{reason}→ Failed{ask, reason}
//   Saving hears no other save.
//
// Nothing here touches the DOM or the lab: the save is the provider's
// effect (the note's draft, its still, the notes route), faked in tests.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { SketchItem } from '../../core/sketch.ts';

/** What a note asks: of a panel, a note or a tweak; of words, a note, a correction or a removal. */
const NoteAsk = Schema.Literals(['note', 'tweak', 'correction', 'removal']);
type NoteAsk = typeof NoteAsk.Type;

/** What a save sends: what it asks, the owner's words, a correction's words to say instead, his marks. */
const Sent = {
  ask: NoteAsk,
  text: Schema.String,
  replace: Schema.String,
  sketch: Schema.Array(SketchItem),
};

/** What a save sends, as the provider's save reads it. */
export interface NoteSave {
  readonly ask: NoteAsk;
  readonly text: string;
  readonly replace: string;
  readonly sketch: ReadonlyArray<SketchItem>;
}

const NoteSaveState = State({
  Idle: {},
  /** A save is on its way, with what it sends. */
  Saving: Sent,
  /** It landed: the note `id` it filed. */
  Saved: { ask: NoteAsk, id: Schema.String },
  /** It was refused: the lab's `reason`. */
  Failed: { ask: NoteAsk, reason: Schema.String },
});
type NoteSaveState = typeof NoteSaveState.Type;

export const NoteSaveEvent = Event({
  /** Save the words (and marks) as a note of its ask. */
  Save: Sent,
  /** The save landed: the note it filed. */
  Landed: { id: Schema.String },
  /** The save was refused: why. */
  Refused: { reason: Schema.String },
});
export type NoteSaveEvent = typeof NoteSaveEvent.Type;

/** The states a save may be asked in: any but Saving. */
const READY = [NoteSaveState.Idle, NoteSaveState.Saved, NoteSaveState.Failed] as const;

/** The note machine over `save` (the note's id, or the lab's reason it refused). */
const noteSaveMachine = <R>(save: (s: NoteSave) => Effect.Effect<string, string, R>) =>
  Machine.make({
    state: NoteSaveState,
    event: NoteSaveEvent,
    initial: NoteSaveState.Idle,
  })
    .on(READY, NoteSaveEvent.Save, ({ event }) =>
      NoteSaveState.Saving({
        ask: event.ask,
        text: event.text,
        replace: event.replace,
        sketch: event.sketch,
      }),
    )
    .task(
      NoteSaveState.Saving,
      ({ state }) =>
        save({
          ask: state.ask,
          text: state.text,
          replace: state.replace,
          sketch: state.sketch,
        }).pipe(
          Effect.map((id) => NoteSaveEvent.Landed({ id })),
          Effect.catch((reason) => Effect.succeed(NoteSaveEvent.Refused({ reason }))),
        ),
      { onSuccess: (event) => event },
    )
    .on(NoteSaveState.Saving, NoteSaveEvent.Landed, ({ state, event }) =>
      NoteSaveState.Saved({ ask: state.ask, id: event.id }),
    )
    .on(NoteSaveState.Saving, NoteSaveEvent.Refused, ({ state, event }) =>
      NoteSaveState.Failed({ ask: state.ask, reason: event.reason }),
    );

/** The note machine's actor, started, idle, saving through `save`. */
export const spawnNoteSave = <R>(save: (s: NoteSave) => Effect.Effect<string, string, R>) =>
  Machine.spawn(noteSaveMachine(save)).pipe(Effect.tap((actor) => actor.start));

export type NoteSaveActor = Effect.Success<ReturnType<typeof spawnNoteSave<never>>>;

/** What a saved note of each ask does next, as its line says it. */
const NEXT: Readonly<Record<NoteAsk, string>> = {
  note: 'it waits in Notes and asks',
  tweak: 'an agent makes the panel again from it',
  correction: 'an agent says the words you wrote instead',
  removal: 'an agent cuts the words',
};

/** What a note state says on the page: the save on its way, landed or refused; nothing while idle. */
export const noteSaveLine = (state: NoteSaveState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Idle: () => Option.none<string>(),
      Saving: (s) => Option.some(`Saving the ${s.ask}…`),
      Saved: (s) => Option.some(`Saved ${s.id}: ${NEXT[s.ask]}.`),
      Failed: (s) => Option.some(`Not saved: ${s.reason}`),
    }),
  );
