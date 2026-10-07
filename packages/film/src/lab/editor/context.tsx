// The editor's provider: its machine's actor (one per lab page, run on the
// shell's runtime), the scene the strip shows, what the lab knows of that
// scene's source and of the selected scene's, and the film's check. The strip,
// the inspector and the knobs (rows and handles) read this context and send
// the machine events; none holds state of its own, nor reaches into another
// panel's.
//
// A grip follows the press that grabbed it (`Pointer.press`) until the press
// ends: lifted it lands, ended by the browser it goes back; one grip is held
// at a time, so another finger's press meanwhile grabs nothing. Escape lets it go
// while the machine is Pressed or Dragging, and only then. Its edges snap
// while the viewer's Snap is on (kept in the browser, `film-studio.snap`, a
// per-viewer setting as the lab's mode is), Shift flipping it for a move
// (`placesFreely`). The editor's verbs (Undo, Redo, that Escape, Snap) are
// commands on the page's hub (`commands.ts`), and what its writes did is said
// there as they land: the page's receipts.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Effect, Equal, Fiber, Match, Option, Result } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import { Pointer, Surface } from '../../browser/pointer.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import type { SceneEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { ChangeId, CheckLine, CheckReport, SceneSource } from '../../core/schema.ts';
import { type DragEdge, dragFields } from '../../core/timeline.ts';
import { LabApi, type StepVerb, reasonOf, stepRequest, stepWhyNot } from '../api.ts';
import { type Receipt, boundChange, refused } from '../../command/command.ts';
import { goToCommands } from '../../command/go.ts';
import { registerWhile } from '../command/changes.ts';
import { type LabSelection, cueOf, knobOf } from '../../command/selection.ts';
import type { Inspected } from '../../core/field.ts';
import { Actor } from '../actor.tsx';
import { useLab } from '../shell.tsx';
import {
  CueGrip,
  KnobGrip,
  SourceKnown,
  type Write,
  cueRefusal,
  fieldsOf,
  filmPoint,
  knobRefusal,
  placesFreely,
  snapTargets,
  unreadFor,
} from './grip.ts';
import { type Handle, knobMode } from './handles.ts';
import { cueDestinations, editorCommands, snapOf, snapText } from './commands.ts';
import { findingTime, findingsOf, notTaken, receiptOf } from './format.ts';
import { type EditActor, EditEvent, spawnEditor } from './machine.ts';

/** The editor's slot among the page's receipts (`Hub.announce`). */
const EDIT_SLOT = 'edit';

interface EditorState {
  /** The findings to list: the landed write's, else the check the page loaded with. */
  readonly findings: Accessor<ReadonlyArray<CheckLine>>;
  /** The scene the strip shows: the one under the playhead. */
  readonly stripScene: Accessor<string>;
  /** The scene the inspector shows: the selection's, else the strip's. */
  readonly inspected: Accessor<string>;
  readonly stripSource: Accessor<SourceKnown>;
  readonly inspectedSource: Accessor<SourceKnown>;
  /** The film's check as the page loaded: findings, the latest change, what Undo and Redo would do. */
  readonly report: Accessor<Option.Option<CheckReport>>;
  /** Whether `report`'s Undo and Redo are still the newest the page knows: false once it has changed the stack. */
  readonly stackCurrent: Accessor<boolean>;
  /** Whether a grip follows a press now (Pressed or Dragging): the strip offers Cancel while it does. */
  readonly holding: Accessor<boolean>;
  /** The inspector's fields of a cue or knob, as the lab holds it now (`grip.ts`). */
  readonly fieldsOf: (selection: LabSelection) => ReadonlyArray<Inspected>;
  /** Whether a drag's edges snap (the viewer's Snap): Shift flips it for a move. */
  readonly snap: Accessor<boolean>;
}

/** Where on a cue's bar a press landed, and the strip's scale. */
interface Press {
  readonly scene: string;
  readonly cue: string;
  readonly edge: DragEdge;
  /** The press itself: where it landed, and the drag it begins. */
  readonly down: PointerEvent;
  /** Screen pixels per scene second on the strip. */
  readonly perSec: number;
}

/** The overlay's screen box. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A press on a knob's handle on the frame: which, where it sits, and the overlay's screen box. */
interface KnobPress {
  readonly scene: string;
  readonly knob: string;
  readonly handle: Handle;
  readonly box: Box;
  /** The press itself: where it landed, and the drag it begins. */
  readonly down: PointerEvent;
}

interface EditorActions {
  /** A press on a cue's bar: select it, and grab it (or say why it cannot be dragged). */
  readonly press: (press: Press) => void;
  /** A press on a knob's handle: select it, and grab it (or say why it cannot be moved). */
  readonly grabKnob: (press: KnobPress) => void;
  /** Write `write`, showing `edit` until the reload (or say why it is not written now). */
  readonly commit: (write: Write, edit: SceneEdit) => void;
  /** Say why something cannot be written. */
  readonly refuse: (message: string) => void;
}

/** The viewer's Snap, kept in the browser: a convenience, safe to lose (on with nothing kept). */
const keptSnap = keptText(ViewerStore, 'film-studio.snap');

interface EditorContextValue {
  readonly state: EditorState;
  readonly actions: EditorActions;
}

const EditorContext = createContext<EditorContextValue>();

/** The editor's context: only inside `<Editor.Provider>`. */
export const useEditor = (): EditorContextValue => useContext(EditorContext);

/** A source read as the editor knows it: no answer yet is still being read. */
const knownOf = (result: AsyncResult.AsyncResult<SceneSource, unknown>): SourceKnown =>
  AsyncResult.match(result, {
    onInitial: () => SourceKnown.Reading(),
    onFailure: (f) => unreadFor(reasonOf(f.cause)),
    onSuccess: (s) => SourceKnown.Read({ source: s.value }),
  });

const Body = (props: ParentProps<{ readonly actor: EditActor }>) => {
  const { state: lab, actions: labActions, meta } = useLab();
  const { film, runtime, stage } = meta;
  const stateAtom = ActorAtom.make(props.actor);
  const edit = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);

  const sources = Atom.family((scene: string) =>
    runtime.atom(LabApi.use((api) => api.source(scene))),
  );
  // One count orders this page's history reads and the changes its writes made: each read
  // carries the count it was asked at, so it can claim only the changes made before it.
  let count = 0;
  const next = () => {
    count += 1;
    return count;
  };
  const checkAtom = runtime.atom(
    Effect.flatMap(Effect.sync(next), (asked) =>
      LabApi.use((api) => Effect.map(api.check, (report) => ({ report, asked }))),
    ),
  );

  const stripScene = lab.scene;
  const inspected = createMemo(() =>
    Option.match(lab.selection(), { onNone: stripScene, onSome: (s) => s.scene }),
  );
  const stripResult = useAtomValue(() => sources(stripScene()));
  const inspectedResult = useAtomValue(() => sources(inspected()));
  const stripSource = createMemo(() => knownOf(stripResult()));
  const inspectedSource = createMemo(() => knownOf(inspectedResult()));
  const checked = useAtomValue(() => checkAtom);
  const read = createMemo(() => AsyncResult.value(checked()));
  const report = createMemo(() => Option.map(read(), (r) => r.report));

  const kept = useAtomValue(() => keptSnap);
  const keep = useAtomSet(() => keptSnap);
  const snap = createMemo(() => snapOf(kept()));

  /** The drag of the press that grabbed the grip held now, while it lasts. */
  let following = Option.none<Fiber.Fiber<void>>();
  /** Stop following the held grip's press. */
  const letGo = () => {
    Option.map(following, (drag) => Effect.runFork(Fiber.interrupt(drag)));
    following = Option.none();
  };
  /** The editor's grips: one is held at a time, by one press. */
  const grips = new Surface('the grips');
  /**
   * What the grip just grabbed does as its press goes on: each move moves
   * it, a lift lands it (Release), and a press the browser ends (a page pan,
   * a lost capture) puts it back (Cancel).
   */
  const gripSteps = {
    move: (e: PointerEvent) =>
      send(
        EditEvent.Move({
          pointer: {
            x: e.clientX,
            y: e.clientY,
            free: placesFreely(e.shiftKey, untrack(snap)),
          },
        }),
      ),
    end: (lifted: Option.Option<PointerEvent>) => {
      following = Option.none();
      send(
        Option.match(lifted, {
          onNone: () => EditEvent.Cancel,
          onSome: () => EditEvent.Release,
        }),
      );
    },
  };
  /**
   * The press `down` on a grip, while no other press holds one: `grab` is
   * its work (a selection, the grip pressed), answering whether a grip was
   * grabbed, which then follows the press until it ends. A press of another
   * pointer meanwhile grabs nothing (`Pointer.press`).
   */
  const follow = (down: PointerEvent, grab: () => boolean) => {
    let grabbed = false;
    const drag = Effect.runForkWith(meta.host)(
      Pointer.use((pointer) =>
        pointer.press(down, grips, () => {
          grabbed = grab();
          return Option.liftPredicate(gripSteps, () => grabbed);
        }),
      ),
    );
    // `take` runs in the press's own dispatch: the drag is this grip's once it grabbed one.
    if (grabbed) following = Option.some(drag);
  };

  /** Whether the machine takes a press now; when it does not (a write out), the editor's slot says why. */
  const pressTaken = (): boolean =>
    Option.match(notTaken(edit(), 'press'), {
      onSome: (why) => {
        meta.hub.announce(refused(`not moved: ${why}`), EDIT_SLOT);
        return false;
      },
      onNone: () => true,
    });

  /** The cue `p` presses, selected and grabbed: whether a grip was grabbed. */
  const grabCue = (p: Press): boolean => {
    labActions.select(Option.some(cueOf(p.scene, p.cue)));
    if (!pressTaken()) return false;
    const timeline = stage.timelineOf(p.scene);
    const fields = Option.match(Option.fromUndefinedOr(timeline[p.cue]), {
      onNone: () => [],
      onSome: (span) => dragFields(span, p.edge),
    });
    const refused = cueRefusal(stripSource(), p.cue, fields);
    if (Option.isSome(refused)) {
      send(EditEvent.Refuse({ message: refused.value }));
      return false;
    }
    const placed = Result.getSuccess(sceneOf(film.placed, p.scene));
    const cues = stage.cuesOf(p.scene);
    const grip = Option.all({
      placed,
      span: Option.fromUndefinedOr(timeline[p.cue]),
      cue0: Option.fromUndefinedOr(cues.get(p.cue)),
    });
    return Option.isSome(
      Option.map(grip, (g) =>
        send(
          EditEvent.Press({
            grip: CueGrip.make({
              scene: p.scene,
              cue: p.cue,
              edge: p.edge,
              x0: p.down.clientX,
              perSec: p.perSec,
              fps: film.fps,
              span: g.span,
              timeline,
              cue0: g.cue0,
              targets: snapTargets(g.placed, cues, p.cue),
            }),
          }),
        ),
      ),
    );
  };
  const press = (p: Press) => follow(p.down, () => grabCue(p));

  /** The knob handle `p` presses, selected and grabbed: whether it was grabbed. */
  const grabKnobOf = (p: KnobPress): boolean => {
    labActions.select(Option.some(knobOf(p.scene, p.knob)));
    if (!pressTaken()) return false;
    const refused = knobRefusal(stripSource(), p.knob);
    if (Option.isSome(refused)) {
      send(EditEvent.Refuse({ message: refused.value }));
      return false;
    }
    const knobs = stage.knobsOf(p.scene);
    const frame = {
      left: p.box.left,
      top: p.box.top,
      sx: film.width / p.box.width,
      sy: film.height / p.box.height,
    };
    send(
      EditEvent.Press({
        grip: KnobGrip.make({
          scene: p.scene,
          knob: p.knob,
          mode: knobMode(knobs, p.knob, p.handle, [film.width, film.height]),
          from: p.handle.value,
          m: p.handle.m,
          inv: p.handle.inv,
          frame,
          start: filmPoint(frame, { x: p.down.clientX, y: p.down.clientY, free: false }),
          knobs,
        }),
      }),
    );
    return true;
  };
  const grabKnob = (p: KnobPress) => follow(p.down, () => grabKnobOf(p));

  // A grip let go no longer follows its press.
  const holding = createMemo(() => edit()._tag === 'Pressed' || edit()._tag === 'Dragging');
  createEffect(holding, (held) => {
    if (!held) letGo();
  });
  onCleanup(letGo);

  // A grip held holds every reload (an agent's save of any file the build reads), so the
  // drag is not lost under the finger; a write out holds it (the rebuild its own scene file
  // starts) until it is answered, so its receipt and its Undo are said before the page goes,
  // and outlive it.
  const out = createMemo(() => edit()._tag === 'Writing' || edit()._tag === 'Checking');
  const waitsFor = createMemo((): Option.Option<string> => {
    if (holding()) return Option.some('let go of the cue or handle');
    return Option.liftPredicate('wait for the write’s answer', () => out());
  });
  createEffect(waitsFor, (why) => {
    Effect.runFork(meta.reloads.hold('edit', why));
  });
  onCleanup(() => {
    Effect.runFork(meta.reloads.hold('edit', Option.none()));
  });

  // The editor's receipts, on the page's hub as its machine moves (`receiptOf`),
  // each once, in one slot: `writing…` becomes what was moved, `undoing…` what was undone.
  let announced = Option.none<Receipt>();
  createEffect(
    () => receiptOf(edit(), meta.name),
    (receipt) => {
      const fresh = Option.filter(receipt, (r) => !Option.exists(announced, Equal.equals(r)));
      Option.map(fresh, (r) => {
        announced = Option.some(r);
        meta.hub.announce(r, EDIT_SLOT);
      });
    },
  );

  // The changes this page's writes and steps made, each with the count it landed at.
  const [made, setMade] = createSignal<ReadonlyMap<ChangeId, number>>(new Map());
  createEffect(
    () => edit(),
    (state) => {
      if (state._tag === 'Written')
        Option.map(state.change, (c) => setMade((m) => new Map([...m, [c, next()]])));
    },
  );
  // Those the history as read cannot hold: made after that read was asked. A read asked
  // after a change holds it; one asked before does not, whenever its answer lands.
  const madeHere = createMemo(() => {
    const asked = Option.match(read(), { onNone: () => 0, onSome: (r) => r.asked });
    return new Set([...made()].filter(([, at]) => at > asked).map(([c]) => c));
  });
  // A step refused (another client's change came after the one it named, or the change is
  // gone) reads the history again, so Undo's label and the change it names move together
  // to the stack as it is, and the next press steps what the refusal said to.
  const readHistory = useAtomRefresh(() => checkAtom);
  let stepOut = false;
  createEffect(
    () => edit(),
    (state) => {
      const refusedStep = stepOut && state._tag === 'Refused';
      stepOut = Match.value(state).pipe(
        Match.tag('Writing', 'Checking', (s) => s.write._tag === 'StepWrite'),
        Match.orElse(() => false),
      );
      if (refusedStep) readHistory();
    },
  );
  // The stack as the page read it names what Undo and Redo step until the page changes it.
  const stackCurrent = createMemo(() => madeHere().size === 0);

  // Each step is its own request, with an id no other has: with no answer, the lab says by it
  // whether it landed. A receipt's names its change, so the lab steps that one or refuses.
  const step = (verb: StepVerb, change: Option.Option<ChangeId>) =>
    send(EditEvent.Step({ verb, request: Effect.runSync(stepRequest), change }));
  // A commit (a field, an ease, a nudge) the machine does not take now says why, in the editor's slot.
  const commit = (write: Write, shown: SceneEdit) =>
    Option.match(notTaken(edit(), 'commit'), {
      onSome: (why) => meta.hub.announce(refused(`not written: ${why}`), EDIT_SLOT),
      onNone: () => send(EditEvent.Commit({ write, edit: shown })),
    });

  /** What the lab knows of `scene`'s source: the inspected scene's, else the strip's. */
  const sourceOf = (scene: string): SourceKnown =>
    Option.getOrElse(
      Option.fromUndefinedOr(
        [inspectedSource(), stripSource()][[inspected(), stripScene()].indexOf(scene)],
      ),
      () => SourceKnown.Unread({ reason: `${scene} is neither inspected nor on the strip` }),
    );

  /** The inspector's fields of `s`, read again with each reload. */
  const fieldsAt = (s: LabSelection): ReadonlyArray<Inspected> => {
    lab.revision();
    return fieldsOf(s, {
      timeline: stage.timelineOf(s.scene),
      cues: stage.cuesOf(s.scene),
      knobs: stage.knobsOf(s.scene),
      known: sourceOf(s.scene),
      fps: film.fps,
      commit,
    });
  };

  /** The strip scene's cues, by when they start (then by name). */
  const stripCues = () => {
    lab.revision();
    const scene = stripScene();
    const names = [...stage.cuesOf(scene)]
      .toSorted(([a, ca], [b, cb]) => ca.start - cb.start || a.localeCompare(b))
      .map(([name]) => name);
    return { scene, names };
  };

  /** Film seconds at which `scene` starts. */
  const sceneStart = (scene: string): number =>
    Option.match(Result.getSuccess(sceneOf(film.placed, scene)), {
      onNone: () => 0,
      onSome: (p) => p.start,
    });

  /** The film times at which the strip scene's cues start or end, in order, each once. */
  const edges = (): ReadonlyArray<number> => {
    lab.revision();
    const scene = stripScene();
    const start = sceneStart(scene);
    const times = [...stage.cuesOf(scene).values()].flatMap((c) => [
      start + c.start,
      start + c.end,
    ]);
    return [...new Set(times)].toSorted((a, b) => a - b);
  };

  /** Film seconds at which the strip scene's cue `name` starts, as the stage holds it now. */
  const startOf = (name: string): number => {
    const scene = untrack(stripScene);
    return (
      sceneStart(scene) +
      Option.match(Option.fromUndefinedOr(stage.cuesOf(scene).get(name)), {
        onNone: () => 0,
        onSome: (cue) => cue.start,
      })
    );
  };
  const select = (s: LabSelection) => labActions.select(Option.some(s));
  const seek = (T: number) => meta.player.seek(T);

  // Each cue of the strip's scene is a place ⌘K goes to by its name; the
  // list follows the strip's scene and its cues, not each frame an edit shows.
  const stripNames = createMemo(stripCues, {
    equals: (a, b) => a.scene === b.scene && a.names.join('\n') === b.names.join('\n'),
  });
  registerWhile(meta.hub, () =>
    goToCommands(cueDestinations(stripNames(), { select, seek, startOf })),
  );

  // The editor's verbs on the page's hub: Undo (⌘Z) and Redo (⇧⌘Z) while the
  // server's stack has a step, Escape letting a held grip go (from a field
  // too), Select, the nudges and the walk through the strip's cues.
  onCleanup(
    meta.hub.commands.register(
      ...editorCommands({
        undoable: (verb) => Option.flatMap(report(), (r) => Option.fromUndefinedOr(r[verb])),
        stackCurrent,
        // A change this page made since it read the history is one that history cannot
        // know: judged as unread, so the lab decides (it reloads onto the history soon).
        whyNot: (verb, bound) =>
          stepWhyNot(
            verb,
            meta.name,
            Option.filter(
              report(),
              () => !Option.exists(boundChange(bound), (c) => madeHere().has(c)),
            ),
          )(bound),
        step,
        notTaken: (verb) => notTaken(edit(), verb),
        holding,
        cancel: () => send(EditEvent.Cancel),
        selected: lab.selection,
        select,
        fieldsOf: fieldsAt,
        stripCues,
        startOf,
        edges,
        T: lab.T,
        seek,
        findingTimes: () =>
          findingsOf(edit(), report()).flatMap((f) => Option.toArray(findingTime(f, film.placed))),
        snap,
        setSnap: (on) => keep(snapText(on)),
      }),
    ),
  );

  const value: EditorContextValue = {
    state: {
      findings: () => findingsOf(edit(), report()),
      stripScene,
      inspected,
      stripSource,
      inspectedSource,
      report,
      stackCurrent,
      holding,
      fieldsOf: fieldsAt,
      snap,
    },
    actions: {
      press,
      grabKnob,
      commit,
      refuse: (message) => send(EditEvent.Refuse({ message })),
    },
  };
  return <EditorContext value={value}>{props.children}</EditorContext>;
};

/** The editor's state and actions, for the strip and the inspector inside it. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  return (
    <Actor runtime={meta.runtime} spawn={spawnEditor}>
      {(actor) => <Body actor={actor}>{props.children}</Body>}
    </Actor>
  );
};
