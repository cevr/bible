// The lab's writes to scene files, as one machine: a drag on the strip or of
// a knob's handle on the frame (a press grabs a cue or a knob and pauses the
// film, moves preview it in memory, the release writes what changed), a field
// or an ease set in the inspector, and Undo or Redo. One machine serializes
// them all, so two writes never race for one file: while a write is out, a
// press or a step is not taken, and a commit (a nudge, a field) waits in
// `next`, shown at once: joined onto one waiting for the same cue or knob
// (its fields merged, the last asked of each winning), else after the rest,
// each written in turn once the write before it lands, so the last value
// asked of every field is the one that lands; those that waited on a step,
// or on a write that did not land, are not written, and the receipt says so.
// While a grip is held, neither a commit nor a step is taken; what the
// machine does not take, the editor's commands and actions say (`notTaken`).
//
//   Idle | Written | Refused ─Press→ Pressed ─Move→ Dragging ─Release→ Writing
//                   ─Commit | Step→ Writing ─Wrote→ Written | ─Failed | TimedOut→ Refused
//   Writing ─Commit→ Writing (next) ─Wrote→ Writing (next, reentered)
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

import { Array as Arr, Duration, Effect, Equal, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { SceneEdit } from '../../canvas/film.ts';
import { CheckLine, type CheckReport, LabWrite } from '../../core/schema.ts';
import { STUDIO_IMPORT_WAIT_S } from '../../core/studio.ts';
import { readAtLoad } from '../../player/narrated.ts';
import { LabApi, LabUnreachable, StepVerb, landedStep } from '../api.ts';
import { Stage } from '../stage.ts';
import { Grip, Pointer, StepWrite, Write, drag, joined, wroteNote } from './grip.ts';

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

/** How long reading the lab's steps may take once a step's wait is over. */
const CHECK_WAIT = Duration.seconds(15);

/**
 * A commit asked while a write is out (a nudge, a field): shown at once, so
 * the next one moves on from it, and written once that write lands. One to
 * the same thing as one waiting joins it (`joined`: the fields merged, the
 * last asked value of each winning); one to another thing waits after it.
 * `edit` is what its scene shows now, the latest of its scene's commits.
 */
const Queued = Schema.Struct({ write: Write, edit: SceneEdit });
type Queued = typeof Queued.Type;
const Waiting = Schema.Array(Queued);
type Waiting = typeof Waiting.Type;

export const EditState = State({
  /** At rest: `note` is what the last thing done said, if anything. */
  Idle: { note: Schema.String },
  /** A cue or a knob handle is grabbed and has not moved yet: a release here only selects it. */
  Pressed: { grip: Grip, note: Schema.String },
  /** A cue or a knob handle is being dragged: `write` is what its release sends, none when back where it began. */
  Dragging: { grip: Grip, write: Schema.Option(Write), note: Schema.String },
  /**
   * A write is out: the server is changing a scene file. `next` is what was
   * asked while it is out, one write per thing in the order first asked
   * (`Queued`), shown already and written in turn once this one lands.
   */
  Writing: { write: Write, next: Waiting },
  /** An Undo or Redo had no answer in STEP_TIMEOUT_S: the lab is asked whether it landed, by its request's id. */
  Checking: { write: StepWrite, next: Waiting },
  /**
   * The write landed; the page reloads with it. `undo` is the step that
   * undoes it (Redo for an Undo), and `change` the change it made, by its id
   * (none when it changed nothing): what its receipt's button acts on.
   */
  Written: {
    note: Schema.String,
    findings: Schema.Array(CheckLine),
    undo: StepVerb,
    change: Schema.Option(Schema.String),
  },
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
  /** An Undo or Redo, with an id unique to this request (`StepWrite.request`), of one change or the newest. */
  Step: { verb: StepVerb, request: Schema.String, change: Schema.Option(Schema.String) },
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

/** The step that undoes `write` once it lands: Redo for an Undo, else Undo. */
const UNDONE_BY = { undo: 'redo', redo: 'undo' } as const satisfies Record<StepVerb, StepVerb>;
const undoneBy = (write: Write): StepVerb =>
  Match.value(write).pipe(
    Match.tag('StepWrite', (s): StepVerb => UNDONE_BY[s.verb]),
    Match.orElse((): StepVerb => 'undo'),
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
  const landed = landedStep(report, step.request);
  if (Option.isSome(landed)) return EditEvent.Landed({ result: landed.value });
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
        StepWrite: (w) => api.step(w.verb, w.request, w.change),
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

/** Send `write`, holding `#t=` for the reload it causes; `next` waits on it. */
const writing = (write: Write, next: Waiting = []) =>
  Stage.use((stage) => Effect.as(stage.holdT, EditState.Writing({ write, next })));

/** What a waiting commit says when it is not written: `n` of them. */
const notWritten = (n: number) => {
  if (n === 1) return 'the edit asked while it was out was not written';
  return `the ${n} edits asked while it was out were not written`;
};

/** `said`, with why the commits waiting as `next`, if any, were not written (`why`). */
const sayDropped = (said: string, next: Waiting, why = ''): string => {
  if (next.length === 0) return said;
  return `${said}; ${notWritten(next.length)}${why}`;
};

/** Put back what the commits waiting as `next` showed: they will not be written. */
const dropNext = (next: Waiting) =>
  Stage.use((stage) =>
    Effect.forEach(Arr.dedupe(next.flatMap((q) => Option.toArray(sceneOfWrite(q.write)))), (s) =>
      stage.unpreview(s),
    ),
  );

/**
 * Show `edit` of `write`'s scene, then send `write`, `next` waiting on it;
 * one the timeline cannot show is refused, and what waited with it put back.
 */
const commit = (write: Write, edit: SceneEdit, next: Waiting = []) =>
  Option.match(sceneOfWrite(write), {
    onNone: () => writing(write, next),
    onSome: (scene) =>
      Stage.use((stage) =>
        stage.preview(scene, edit).pipe(
          Effect.flatMap(() => writing(write, next)),
          Effect.catchTag('NotPreviewed', (e) =>
            Effect.as(dropNext(next), EditState.Refused({ message: sayDropped(e.message, next) })),
          ),
        ),
      ),
  });

/**
 * `next` with a commit asked while a write is out: shown now (so a nudge
 * after it moves on from it; one the timeline cannot show is shown when it
 * is written, and refused then), joined onto the one waiting for the same
 * thing (`joined`), else waiting after the rest; every waiting commit of its
 * scene now shows its edit, the latest.
 */
const queued = (next: Waiting, write: Write, edit: SceneEdit) =>
  Stage.use((stage) =>
    Option.match(sceneOfWrite(write), {
      onNone: () => Effect.void,
      onSome: (scene) => Effect.ignore(stage.preview(scene, edit)),
    }),
  ).pipe(
    Effect.as(
      Option.match(
        Arr.findFirst(next, (q) => joined(q.write, write)),
        {
          onNone: () => [...next, { write, edit }],
          onSome: (both) =>
            next.map((q) => {
              if (Option.isSome(joined(q.write, write))) return { write: both, edit };
              return q;
            }),
        },
      ).map((q) => {
        if (Equal.equals(sceneOfWrite(q.write), sceneOfWrite(write))) return { ...q, edit };
        return q;
      }),
    ),
  );

/** Why a commit waiting on a step is not written once it lands. */
const beforeStep = (step: StepWrite) => `: it was asked of the film before the ${step.verb}`;

/** A write that did not land: let `#t=` go, put the preview back, and say `message`. */
const refuse = (write: Write, message: string, next: Waiting = []) =>
  Stage.use((stage) =>
    stage.settle.pipe(
      Effect.andThen(
        Option.match(sceneOfWrite(write), {
          onNone: () => Effect.void,
          onSome: stage.unpreview,
        }),
      ),
      Effect.andThen(dropNext(next)),
      Effect.as(EditState.Refused({ message: sayDropped(message, next) })),
    ),
  );

/**
 * `write` landed as `result`: Written, reloading the page itself for a file
 * it reads at load (no rebuild follows one). The commits waiting on it are
 * written next, in turn (a step's are not: they were asked of the film
 * before the step).
 */
const landedAs = (write: Write, result: LabWrite, next: Waiting) => {
  const written = (note: string) =>
    EditState.Written({
      note,
      findings: result.findings,
      undo: undoneBy(write),
      change: Option.fromUndefinedOr(result.change),
    });
  const rest = (note: string) =>
    Stage.use((stage) =>
      Effect.as(Effect.when(stage.reload, Effect.succeed(readAtLoad(result.file))), written(note)),
    );
  return Match.value(write).pipe(
    Match.tag('StepWrite', (step) =>
      Effect.andThen(
        dropNext(next),
        rest(sayDropped(wroteNote(write, result), next, beforeStep(step))),
      ),
    ),
    Match.orElse(() =>
      Option.match(Arr.head(next), {
        onNone: () => rest(wroteNote(write, result)),
        onSome: (q) => commit(q.write, q.edit, next.slice(1)),
      }),
    ),
  );
};

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
  .on(AT_REST, EditEvent.Commit, ({ event }) => commit(event.write, event.edit))
  // A commit while a write is out waits (shown now), joined onto one waiting for the same thing,
  // else after the rest: never dropped. The same state, so the write out and its wait go on (no reentry).
  .on(EditState.Writing, EditEvent.Commit, ({ state, event }) =>
    Effect.map(queued(state.next, event.write, event.edit), (next) =>
      EditState.Writing({ ...state, next }),
    ),
  )
  .on(EditState.Checking, EditEvent.Commit, ({ state, event }) =>
    Effect.map(queued(state.next, event.write, event.edit), (next) =>
      EditState.Checking({ ...state, next }),
    ),
  )
  .on(AT_REST, EditEvent.Step, ({ event }) =>
    writing(StepWrite.make({ verb: event.verb, request: event.request, change: event.change })),
  )
  .task(EditState.Writing, ({ state }) => send(state.write), {
    onSuccess: (result) => EditEvent.Wrote({ result }),
    onFailure: (e) => EditEvent.Failed({ message: e.message }),
  })
  // Reentered: the commit that waited is the next write out, with a task and a wait of its own.
  .reenter(EditState.Writing, EditEvent.Wrote, ({ state, event }) =>
    landedAs(state.write, event.result, state.next),
  )
  .on(EditState.Writing, EditEvent.Failed, ({ state, event }) =>
    refuse(state.write, event.message, state.next),
  )
  .timeout(EditState.Writing, {
    duration: (state) => waitFor(state.write),
    event: EditEvent.TimedOut,
  })
  .on(EditState.Writing, EditEvent.TimedOut, ({ state }) =>
    Match.value(state.write).pipe(
      // A step with no answer is never guessed at: the lab says, by its request's id.
      Match.tag('StepWrite', (write) =>
        Effect.succeed(EditState.Checking({ write, next: state.next })),
      ),
      Match.orElse((write) =>
        refuse(
          write,
          `the write had no answer in ${WRITE_TIMEOUT_S} s; see whether it changed the scene file (git diff) before writing again`,
          state.next,
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
      stage.settle.pipe(
        Effect.andThen(dropNext(state.next)),
        Effect.as(
          EditState.Written({
            note: sayDropped(note, state.next, beforeStep(state.write)),
            findings: event.result.findings,
            undo: undoneBy(state.write),
            change: Option.fromUndefinedOr(event.result.change),
          }),
        ),
      ),
    );
  })
  .on(EditState.Checking, EditEvent.Failed, ({ state, event }) =>
    refuse(state.write, event.message, state.next),
  );

/** The editor's actor, started. */
export const spawnEditor = Machine.spawn(editMachine).pipe(Effect.tap((actor) => actor.start));

/** The editor's actor, as `spawnEditor` makes it. */
export type EditActor = Effect.Success<typeof spawnEditor>;
