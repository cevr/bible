// The lab's writes to scene files, as one machine: a drag on the strip or of
// a knob's handle on the frame (a press grabs a cue or a knob and pauses the
// film, moves preview it in memory, the release writes what changed), a field
// or an ease set in the inspector, and Undo or Redo. One machine serializes
// them all: while a write is out, a press or another write is not taken, so
// two writes never race for one file.
//
//   Idle | Written | Refused ─Press→ Pressed ─Move→ Dragging ─Release→ Writing
//                   ─Commit | Step→ Writing ─Wrote→ Written | ─Failed→ Refused
//
// A write holds `#T` at the frame it is asked at (the file change reloads the
// page there); a refused one lets it go and puts the preview back. Nothing
// here touches the DOM: the stage and the API are services, faked in tests.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { CheckLine, LabWrite } from '../../core/schema.ts';
import { LabApi, StepVerb } from '../api.ts';
import { Stage } from '../stage.ts';
import { Edit, Grip, Pointer, StepWrite, Write, drag, wroteNote } from './grip.ts';

export const EditState = State({
  /** At rest: `note` is what the last thing done said, if anything. */
  Idle: { note: Schema.String },
  /** A cue or a knob handle is grabbed and has not moved yet: a release here only selects it. */
  Pressed: { grip: Grip, note: Schema.String },
  /** A cue or a knob handle is being dragged: `write` is what its release sends, none when back where it began. */
  Dragging: { grip: Grip, write: Schema.Option(Write), note: Schema.String },
  /** A write is out: the server is changing a scene file. */
  Writing: { write: Write },
  /** The write landed; the page reloads with it. */
  Written: { note: Schema.String, findings: Schema.Array(CheckLine) },
  /** The server, or the lab, said no: its words. */
  Refused: { message: Schema.String },
});
export type EditState = typeof EditState.Type;

export const EditEvent = Event({
  Press: { grip: Grip },
  /** A press on something the lab may not write: why. */
  Refuse: { message: Schema.String },
  Move: { pointer: Pointer },
  Release: {},
  Cancel: {},
  /** A write asked for from rest (a field, an ease, a knob), shown first as `edit`. */
  Commit: { write: Write, edit: Edit },
  Step: { verb: StepVerb },
  Wrote: { result: LabWrite },
  Failed: { message: Schema.String },
});
export type EditEvent = typeof EditEvent.Type;

const AT_REST = [EditState.Idle, EditState.Written, EditState.Refused] as const;

/** The scene a write changes, when it names one (Undo and Redo do not). */
const sceneOfWrite = (write: Write): Option.Option<string> =>
  Match.value(write).pipe(
    Match.tag('StepWrite', () => Option.none<string>()),
    Match.orElse((w) => Option.some(w.scene)),
  );

/** The call that makes `write`. */
const send = (write: Write) =>
  LabApi.use((api) =>
    Match.value(write).pipe(
      Match.tagsExhaustive({
        CueWrite: (w) => api.writeCue(w.scene, w.cue, w.patch),
        KnobWrite: (w) => api.writeKnob(w.scene, w.knob, w.value),
        StepWrite: (w) => api.step(w.verb),
      }),
    ),
  );

const noteOf = (state: EditState): string =>
  Match.value(state).pipe(
    Match.tag('Idle', 'Pressed', 'Dragging', 'Written', (s) => s.note),
    Match.tag('Refused', (s) => s.message),
    Match.orElse(() => ''),
  );

/** Put back what a grip previewed, and rest. */
const letGo = (scene: string, note: string) =>
  Stage.use((stage) => Effect.as(stage.unpreview(scene), EditState.Idle({ note })));

/** Send `write`, holding `#T` for the reload it causes. */
const writing = (write: Write) =>
  Stage.use((stage) => Effect.as(stage.holdT, EditState.Writing({ write })));

export const editMachine = Machine.make({
  state: EditState,
  event: EditEvent,
  initial: EditState.Idle({ note: '' }),
})
  .on(AT_REST, EditEvent.Press, ({ state, event }) =>
    Stage.use((stage) =>
      Effect.as(stage.pause, EditState.Pressed({ grip: event.grip, note: noteOf(state) })),
    ),
  )
  .on(AT_REST, EditEvent.Refuse, ({ event }) => EditState.Refused({ message: event.message }))
  .on([EditState.Pressed, EditState.Dragging], EditEvent.Move, ({ state, event }) => {
    const dragged = drag(state.grip, event.pointer);
    return Stage.use((stage) =>
      stage.preview(dragged.scene, dragged.edit).pipe(
        Effect.as(''),
        Effect.catchTag('NotPreviewed', (e) => Effect.succeed(e.message)),
        Effect.map((note) => EditState.Dragging({ grip: state.grip, write: dragged.write, note })),
      ),
    );
  })
  .on(EditState.Pressed, EditEvent.Release, ({ state }) => EditState.Idle({ note: state.note }))
  .on(EditState.Dragging, EditEvent.Release, ({ state }) =>
    Option.match(state.write, {
      onNone: () => letGo(state.grip.scene, state.note),
      onSome: writing,
    }),
  )
  .on([EditState.Pressed, EditState.Dragging], EditEvent.Cancel, ({ state }) =>
    letGo(state.grip.scene, state.note),
  )
  .on(AT_REST, EditEvent.Commit, ({ event }) =>
    Option.match(sceneOfWrite(event.write), {
      onNone: () => writing(event.write),
      onSome: (scene) =>
        Stage.use((stage) =>
          stage.preview(scene, event.edit).pipe(
            Effect.flatMap(() => writing(event.write)),
            Effect.catchTag('NotPreviewed', (e) =>
              Effect.succeed(EditState.Refused({ message: e.message })),
            ),
          ),
        ),
    }),
  )
  .on(AT_REST, EditEvent.Step, ({ event }) => writing(StepWrite.make({ verb: event.verb })))
  .task(EditState.Writing, ({ state }) => send(state.write), {
    onSuccess: (result) => EditEvent.Wrote({ result }),
    onFailure: (e) => EditEvent.Failed({ message: e.message }),
  })
  .on(EditState.Writing, EditEvent.Wrote, ({ state, event }) =>
    EditState.Written({
      note: wroteNote(state.write, event.result),
      findings: event.result.findings,
    }),
  )
  .on(EditState.Writing, EditEvent.Failed, ({ state, event }) =>
    Stage.use((stage) =>
      stage.settle.pipe(
        Effect.andThen(
          Option.match(sceneOfWrite(state.write), {
            onNone: () => Effect.void,
            onSome: stage.unpreview,
          }),
        ),
        Effect.as(EditState.Refused({ message: event.message })),
      ),
    ),
  );

/** The editor's actor, started. */
export const spawnEditor = Machine.spawn(editMachine).pipe(Effect.tap((actor) => actor.start));

/** The editor's actor, as `spawnEditor` makes it. */
export type EditActor = Effect.Success<typeof spawnEditor>;
