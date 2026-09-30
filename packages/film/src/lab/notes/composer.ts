// The note composer, as one machine: a press on the frame pauses the film and
// starts a mark (a pinned point, a box once the pointer has moved far, or a
// pen stroke, which adds to the ink already drawn), a lift opens the composer
// at that frame, and `n` opens it on the whole frame. A save captures the
// frame's still and posts the draft (the state's task, so one save is out at
// a time and a press while it is out is not taken); it closes on the note the
// server made, or goes back to the draft with the server's words.
//
//   Closed | Open ─Press→ Marking ─Drag→ Marking ─Lift→ Open
//   Closed ─Note→ Open ─Save→ Saving ─Saved→ Closed | ─Failed→ Open
//   Open | Marking ─Cancel→ Closed
//
// Nothing here touches the DOM: the stage (pause, the still) and the notes
// API are services, faked in tests.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { InkStroke, NoteBox, NoteDraft, Point } from '../../core/schema.ts';
import { NotesApi } from '../api.ts';
import { Stage } from '../stage.ts';
import { boxOf, pointBox } from './draft.ts';

const Marks = {
  /** The frame noted, film seconds. */
  T: Schema.Finite,
  box: Schema.Option(NoteBox),
  ink: Schema.Array(InkStroke),
};

export const ComposerState = State({
  /** No note being made: `saved` is the note the last save made, if it was one. */
  Closed: { saved: Schema.Option(Schema.String) },
  /** The pointer is down on the frame, from `from`: drawing ink with the pen, else a point or a box. */
  Marking: { ...Marks, from: Point, pen: Schema.Boolean },
  /** The composer is open on the frame: `status` is what the last save said, if it failed. */
  Open: { ...Marks, status: Schema.String },
  /** The note is out: its still, then the post. */
  Saving: { ...Marks, draft: NoteDraft },
});
export type ComposerState = typeof ComposerState.Type;

export const ComposerEvent = Event({
  /** The pointer went down on the frame at `at` (film pixels), the frame shown being `T`. */
  Press: { T: Schema.Finite, at: Point, pen: Schema.Boolean },
  /** It moved to `at`; `far` once it is far enough from where it went down to be a drag. */
  Drag: { at: Point, far: Schema.Boolean },
  Lift: { at: Point, far: Schema.Boolean },
  /** Note the whole frame `T` (`n`). */
  Note: { T: Schema.Finite },
  Cancel: {},
  Save: { draft: NoteDraft },
  Saved: { id: Schema.String },
  Failed: { reason: Schema.String },
});
export type ComposerEvent = typeof ComposerEvent.Type;

/** The marks a draft shows on the frame: a point or a box, and ink. */
export type Marked = Pick<ComposerState & { readonly _tag: 'Open' }, 'box' | 'ink'>;

const nothing: Marked = { box: Option.none(), ink: [] };

/** The marks a press adds to: a new stroke for the pen, else the box as it is. */
const pressed = (marks: Marked, at: Point, pen: boolean): Marked => {
  if (pen) return { box: marks.box, ink: [...marks.ink, [at]] };
  return marks;
};

/** The ink with `at` added to its last stroke. */
const inked = (ink: ReadonlyArray<InkStroke>, at: Point): ReadonlyArray<InkStroke> => [
  ...ink.slice(0, -1),
  [...(ink.at(-1) ?? []), at],
];

const saving = (state: ComposerState & { readonly _tag: 'Saving' }) =>
  Effect.gen(function* () {
    const still = yield* Stage.use((stage) => stage.still(state.T));
    const note = yield* NotesApi.use((api) => api.add({ ...state.draft, still }));
    return ComposerEvent.Saved({ id: note.id });
  });

export const composerMachine = Machine.make({
  state: ComposerState,
  event: ComposerEvent,
  initial: ComposerState.Closed({ saved: Option.none() }),
})
  .on(ComposerState.Closed, ComposerEvent.Press, ({ event }) =>
    Stage.use((stage) =>
      Effect.as(
        stage.pause,
        ComposerState.Marking({
          T: event.T,
          ...pressed(nothing, event.at, event.pen),
          from: event.at,
          pen: event.pen,
        }),
      ),
    ),
  )
  .on(ComposerState.Open, ComposerEvent.Press, ({ state, event }) =>
    Stage.use((stage) =>
      Effect.as(
        stage.pause,
        ComposerState.Marking({
          T: event.T,
          ...pressed(state, event.at, event.pen),
          from: event.at,
          pen: event.pen,
        }),
      ),
    ),
  )
  .on(ComposerState.Marking, ComposerEvent.Drag, ({ state, event }) => {
    if (state.pen) return ComposerState.Marking({ ...state, ink: inked(state.ink, event.at) });
    if (!event.far) return state;
    return ComposerState.Marking({ ...state, box: Option.some(boxOf(state.from, event.at)) });
  })
  .on(ComposerState.Marking, ComposerEvent.Lift, ({ state, event }) => {
    const open = { T: state.T, ink: state.ink, status: '' };
    if (state.pen) return ComposerState.Open({ ...open, box: state.box });
    if (event.far)
      return ComposerState.Open({ ...open, box: Option.some(boxOf(state.from, event.at)) });
    return ComposerState.Open({ ...open, box: Option.some(pointBox(state.from)) });
  })
  .on(ComposerState.Closed, ComposerEvent.Note, ({ event }) =>
    Stage.use((stage) =>
      Effect.as(stage.pause, ComposerState.Open({ T: event.T, ...nothing, status: '' })),
    ),
  )
  .on([ComposerState.Open, ComposerState.Marking], ComposerEvent.Cancel, () =>
    ComposerState.Closed({ saved: Option.none() }),
  )
  .on(ComposerState.Open, ComposerEvent.Save, ({ state, event }) =>
    ComposerState.Saving({ T: state.T, box: state.box, ink: state.ink, draft: event.draft }),
  )
  .task(ComposerState.Saving, ({ state }) => saving(state), {
    onFailure: (e) => ComposerEvent.Failed({ reason: e.message }),
  })
  .on(ComposerState.Saving, ComposerEvent.Saved, ({ event }) =>
    ComposerState.Closed({ saved: Option.some(event.id) }),
  )
  .on(ComposerState.Saving, ComposerEvent.Failed, ({ state, event }) =>
    ComposerState.Open({ T: state.T, box: state.box, ink: state.ink, status: event.reason }),
  );

/** The composer's actor, closed. */
export const spawnComposer = Machine.spawn(composerMachine).pipe(
  Effect.tap((actor) => actor.start),
);

export type ComposerActor = Effect.Success<typeof spawnComposer>;

/** What the composer's status line says. */
export const composerText = (state: ComposerState): string =>
  Match.value(state).pipe(
    Match.tag('Saving', () => 'saving…'),
    Match.tag('Open', (s) => s.status),
    Match.orElse(() => ''),
  );

/** Whether the composer shows: from the press on the frame until the note is saved or cancelled. */
export const composerOpen = (state: ComposerState): boolean =>
  Match.value(state).pipe(
    Match.tag('Closed', () => false),
    Match.orElse(() => true),
  );

/** Whether the composer waits for the note's words, and so takes the keys. */
export const composerTyping = (state: ComposerState): boolean =>
  Match.value(state).pipe(
    Match.tag('Open', () => true),
    Match.orElse(() => false),
  );

/** The marks a state shows on the frame: the draft's, while one is being made. */
export const draftMarks = (state: ComposerState): Option.Option<Marked> =>
  Match.value(state).pipe(
    Match.tag('Marking', 'Open', 'Saving', (s): Option.Option<Marked> =>
      Option.some({ box: s.box, ink: s.ink }),
    ),
    Match.orElse(() => Option.none<Marked>()),
  );
