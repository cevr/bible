// The lab's writes to scene files, as one machine: a drag on the strip or of
// a knob's handle on the frame (a press grabs a cue or a knob and pauses the
// film, moves preview it in memory, the release writes what changed), a field
// or an ease set in the inspector, and Undo or Redo. One machine serializes
// them all: while a write is out, a press or another write is not taken, so
// two writes never race for one file.
//
//   Idle | Written | Refused ─Press→ Pressed ─Move→ Dragging ─Release→ Writing
//                   ─Commit | Step→ Writing ─Wrote→ Written | ─Failed | TimedOut→ Refused
//   Writing (a step) ─TimedOut (STEP_TIMEOUT_S)→ Checking (the lab's steps
//     read back) ─Landed→ Written | ─Failed→ Refused
//
// A write holds `#t=` at the frame it is asked at (the file change reloads the
// page there; a file the page reads at load, as an Undo of a kept take
// changes, rebuilds nothing, so the machine reloads the page itself); a
// refused one, or one with no answer in WRITE_TIMEOUT_S, lets it go and puts
// the preview back. An Undo or Redo remakes what follows its file before it
// answers (a kept take's track, mixed again), so it waits as long as a
// studio keep does, and one with no answer even then is never guessed at:
// each step carries an id unique to its request, which the lab records on it
// once it lands, and the lab's check says by that id whether it did. Nothing
// here touches the DOM: the stage and the API are services, faked in tests.

import { Array as Arr, Clock, Duration, Effect, Match, Option, Random, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { SceneEdit } from '../../canvas/film.ts';
import { CheckLine, type CheckReport, LabWrite } from '../../core/schema.ts';
import { STUDIO_IMPORT_WAIT_S } from '../../core/studio.ts';
import { readAtLoad } from '../../player/narrated.ts';
import { LabApi, LabUnreachable, StepVerb } from '../api.ts';
import { Stage } from '../stage.ts';
import { Grip, Pointer, StepWrite, Write, drag, wroteNote } from './grip.ts';

/**
 * How long a write may be out before the editor gives up on it: a server that
 * never answers (a hung formatter or check) must not leave every drag, field
 * and Undo refused until the page reloads.
 */
export const WRITE_TIMEOUT_S = 20;

/**
 * How long an Undo or Redo may be out: one of a kept take mixes the track
 * again before it answers, as a studio keep does, so it waits as long as the
 * studio waits for one.
 */
const STEP_TIMEOUT_S = STUDIO_IMPORT_WAIT_S;

/**
 * An id for an Undo or Redo request that no other request has, from any
 * page: the time it was asked, and a random part.
 */
export const stepRequest: Effect.Effect<string> = Effect.map(
  Effect.all([Clock.currentTimeMillis, Random.nextIntBetween(0, 2 ** 52)]),
  ([at, n]) => `${at.toString(36)}-${n.toString(36)}`,
);

/** How long reading the lab's steps may take once a step's wait is over. */
const CHECK_WAIT = Duration.seconds(15);

export const EditState = State({
  /** At rest: `note` is what the last thing done said, if anything. */
  Idle: { note: Schema.String },
  /** A cue or a knob handle is grabbed and has not moved yet: a release here only selects it. */
  Pressed: { grip: Grip, note: Schema.String },
  /** A cue or a knob handle is being dragged: `write` is what its release sends, none when back where it began. */
  Dragging: { grip: Grip, write: Schema.Option(Write), note: Schema.String },
  /** A write is out: the server is changing a scene file. */
  Writing: { write: Write },
  /** An Undo or Redo had no answer in STEP_TIMEOUT_S: the lab is asked whether it landed, by its request's id. */
  Checking: { write: StepWrite },
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
  Commit: { write: Write, edit: SceneEdit },
  /** An Undo or Redo, with an id unique to this request (`StepWrite.request`). */
  Step: { verb: StepVerb, request: Schema.String },
  Wrote: { result: LabWrite },
  Failed: { message: Schema.String },
  /** The write was out its wait (WRITE_TIMEOUT_S, a step STEP_TIMEOUT_S) with no answer. */
  TimedOut: {},
  /** The lab recorded the step that had no answer, by its request's id: it landed, as `result`. */
  Landed: { result: LabWrite },
});
export type EditEvent = typeof EditEvent.Type;

const AT_REST = [EditState.Idle, EditState.Written, EditState.Refused] as const;

/** The scene a write changes, when it names one (Undo and Redo do not). */
const sceneOfWrite = (write: Write): Option.Option<string> =>
  Match.value(write).pipe(
    Match.tag('StepWrite', () => Option.none<string>()),
    Match.orElse((w) => Option.some(w.scene)),
  );

/** How long `write` may be out with no answer: a step remakes what follows its file first. */
const waitFor = (write: Write): Duration.Duration =>
  Match.value(write).pipe(
    Match.tag('StepWrite', () => Duration.seconds(STEP_TIMEOUT_S)),
    Match.orElse(() => Duration.seconds(WRITE_TIMEOUT_S)),
  );

/**
 * What became of `step`, which had no answer, from the lab's check now: it
 * landed when the lab recorded a step under its request's id (whatever
 * change it walked, and whatever landed after it); else it did not, or has
 * not yet, and the latest change is named.
 */
const settleStep = (step: StepWrite, report: CheckReport): EditEvent => {
  const landed = Option.flatMap(Option.fromUndefinedOr(report.landed), (steps) =>
    Arr.findFirst(steps, (l) => l.request === step.request),
  );
  if (Option.isSome(landed)) {
    const { request: _, ...walked } = landed.value;
    return EditEvent.Landed({ result: { ...walked, findings: report.findings } });
  }
  const named = Option.match(Option.fromUndefinedOr(report.latest), {
    onNone: () => 'none',
    onSome: (l) => `${l.target} in ${l.file}`,
  });
  return EditEvent.Failed({
    message: `the ${step.verb} had no answer in ${STEP_TIMEOUT_S} s, and the lab has no record of it (its latest change is ${named}): it did not land, or is still landing; see the lab log before stepping again`,
  });
};

/** The call that makes `write`. */
const send = (write: Write) =>
  LabApi.use((api) =>
    Match.value(write).pipe(
      Match.tagsExhaustive({
        CueWrite: (w) => api.writeCue(w.scene, w.cue, w.patch),
        KnobWrite: (w) => api.writeKnob(w.scene, w.knob, w.value),
        StepWrite: (w) => api.step(w.verb, w.request),
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

/** Send `write`, holding `#t=` for the reload it causes. */
const writing = (write: Write) =>
  Stage.use((stage) => Effect.as(stage.holdT, EditState.Writing({ write })));

/** A write that did not land: let `#t=` go, put the preview back, and say `message`. */
const refuse = (write: Write, message: string) =>
  Stage.use((stage) =>
    stage.settle.pipe(
      Effect.andThen(
        Option.match(sceneOfWrite(write), {
          onNone: () => Effect.void,
          onSome: stage.unpreview,
        }),
      ),
      Effect.as(EditState.Refused({ message })),
    ),
  );

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
  .on(AT_REST, EditEvent.Step, ({ event }) =>
    writing(StepWrite.make({ verb: event.verb, request: event.request })),
  )
  .task(EditState.Writing, ({ state }) => send(state.write), {
    onSuccess: (result) => EditEvent.Wrote({ result }),
    onFailure: (e) => EditEvent.Failed({ message: e.message }),
  })
  .on(EditState.Writing, EditEvent.Wrote, ({ state, event }) => {
    const written = EditState.Written({
      note: wroteNote(state.write, event.result),
      findings: event.result.findings,
    });
    // No rebuild follows a file the page reads at load (an Undo of a kept take): reload it here.
    if (!readAtLoad(event.result.file)) return written;
    return Stage.use((stage) => Effect.as(stage.reload, written));
  })
  .on(EditState.Writing, EditEvent.Failed, ({ state, event }) => refuse(state.write, event.message))
  .timeout(EditState.Writing, {
    duration: (state) => waitFor(state.write),
    event: EditEvent.TimedOut,
  })
  .on(EditState.Writing, EditEvent.TimedOut, ({ state }) =>
    Match.value(state.write).pipe(
      // A step with no answer is never guessed at: the lab says, by its request's id.
      Match.tag('StepWrite', (write) => Effect.succeed(EditState.Checking({ write }))),
      Match.orElse((write) =>
        refuse(
          write,
          `the write had no answer in ${WRITE_TIMEOUT_S} s; see whether it changed the scene file (git diff) before writing again`,
        ),
      ),
    ),
  )
  .task(
    EditState.Checking,
    ({ state }) =>
      LabApi.use((api) => api.check).pipe(
        Effect.timeoutOrElse({
          duration: CHECK_WAIT,
          orElse: () => Effect.fail(LabUnreachable.make({ message: 'no answer to that either' })),
        }),
        Effect.map((report) => settleStep(state.write, report)),
      ),
    {
      onSuccess: (event) => event,
      onFailure: (e, { state }) =>
        EditEvent.Failed({
          message: `the ${state.write.verb} had no answer in ${STEP_TIMEOUT_S} s, nor the lab's check to say whether it landed (${e.message}): see the lab log before stepping again`,
        }),
    },
  )
  // Landed with no answer: what follows the file (the track) had not been
  // remade by then, so nothing reloads, as a studio keep whose mix did not
  // answer; the note says to reload once it has.
  .on(EditState.Checking, EditEvent.Landed, ({ state, event }) => {
    const wrote = wroteNote(state.write, event.result);
    let note = wrote;
    if (readAtLoad(event.result.file))
      note = `${wrote}; the lab had not finished remaking what follows it after ${STEP_TIMEOUT_S} s: reload the page once the lab log says it mixed`;
    return Stage.use((stage) =>
      Effect.as(stage.settle, EditState.Written({ note, findings: event.result.findings })),
    );
  })
  .on(EditState.Checking, EditEvent.Failed, ({ state, event }) =>
    refuse(state.write, event.message),
  );

/** The editor's actor, started. */
export const spawnEditor = Machine.spawn(editMachine).pipe(Effect.tap((actor) => actor.start));

/** The editor's actor, as `spawnEditor` makes it. */
export type EditActor = Effect.Success<typeof spawnEditor>;
