// The editor's provider: its machine's actor (one per lab page, run on the
// shell's runtime), the scene the strip shows, what the lab knows of that
// scene's source and of the selected scene's, and the film's check. The strip,
// the inspector and the knobs (rows and handles) read this context and send
// the machine events; none holds state of its own, nor reaches into another
// panel's.
//
// A grip follows the press that grabbed it (`Pointer.drag`) until the press
// ends: lifted it lands, ended by the browser it goes back. Escape lets it go
// while the machine is Pressed or Dragging, and only then. The editor's verbs
// (Undo, Redo, that Escape) are commands on the page's hub (`commands.ts`).

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Effect, Fiber, Option, Result } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, onCleanup, useContext } from 'solid-js';
import { Pointer } from '../../browser/pointer.ts';
import type { SceneEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { CheckLine, CheckReport, SceneSource } from '../../core/schema.ts';
import type { DragEdge } from '../../core/timeline.ts';
import { LabApi, type StepVerb, reasonOf } from '../api.ts';
import { type LabSelection, cueOf, knobOf } from '../../command/selection.ts';
import type { Inspected } from '../../core/field.ts';
import { useLab } from '../shell.tsx';
import {
  CueGrip,
  KnobGrip,
  type Write,
  cueRefusal,
  fieldsOf,
  filmPoint,
  knobRefusal,
  snapTargets,
} from './grip.ts';
import { type Handle, knobMode } from './handles.ts';
import { editorCommands } from './commands.ts';
import { findingsOf, statusText } from './format.ts';
import { type EditActor, EditEvent, spawnEditor, stepRequest } from './machine.ts';

/** What the lab knows of a scene's source: it, or why it could not be read. */
interface Known {
  readonly source: Option.Option<SceneSource>;
  /** The server's reason, when the source could not be read. */
  readonly error: string;
}

interface EditorState {
  /** What the editor last did, or is doing: the status line. */
  readonly status: Accessor<string>;
  /** The findings to list: the landed write's, else the check the page loaded with. */
  readonly findings: Accessor<ReadonlyArray<CheckLine>>;
  /** The scene the strip shows: the one under the playhead. */
  readonly stripScene: Accessor<string>;
  /** The scene the inspector shows: the selection's, else the strip's. */
  readonly inspected: Accessor<string>;
  readonly stripSource: Accessor<Known>;
  readonly inspectedSource: Accessor<Known>;
  /** The film's check as the page loaded: findings, the latest change, what Undo and Redo would do. */
  readonly report: Accessor<Option.Option<CheckReport>>;
  /** The inspector's fields of a cue or knob, as the lab holds it now (`grip.ts`). */
  readonly fieldsOf: (selection: LabSelection) => ReadonlyArray<Inspected>;
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
  /** Write `write`, showing `edit` until the reload. */
  readonly commit: (write: Write, edit: SceneEdit) => void;
  readonly step: (verb: StepVerb) => void;
  /** Say why something cannot be written. */
  readonly refuse: (message: string) => void;
}

interface EditorContextValue {
  readonly state: EditorState;
  readonly actions: EditorActions;
}

const EditorContext = createContext<EditorContextValue>();

/** The editor's context: only inside `<Editor.Provider>`. */
export const useEditor = (): EditorContextValue => useContext(EditorContext);

const knownOf = (result: AsyncResult.AsyncResult<SceneSource, unknown>): Known =>
  AsyncResult.match(result, {
    onInitial: () => ({ source: Option.none(), error: '' }),
    onFailure: (f) => ({ source: Option.none(), error: reasonOf(f.cause) }),
    onSuccess: (s) => ({ source: Option.some(s.value), error: '' }),
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
  const checkAtom = runtime.atom(LabApi.use((api) => api.check));

  const stripScene = lab.scene;
  const inspected = createMemo(() =>
    Option.match(lab.selection(), { onNone: stripScene, onSome: (s) => s.scene }),
  );
  const stripResult = useAtomValue(() => sources(stripScene()));
  const inspectedResult = useAtomValue(() => sources(inspected()));
  const stripSource = createMemo(() => knownOf(stripResult()));
  const inspectedSource = createMemo(() => knownOf(inspectedResult()));
  const checked = useAtomValue(() => checkAtom);
  const report = createMemo(() => AsyncResult.value(checked()));

  /** The drag of the press that grabbed the grip held now, while it lasts. */
  let following = Option.none<Fiber.Fiber<void>>();
  /** Stop following the held grip's press. */
  const letGo = () => {
    Option.map(following, (drag) => Effect.runFork(Fiber.interrupt(drag)));
    following = Option.none();
  };
  /**
   * The grip just grabbed follows the press `down` began: each move moves it,
   * a lift lands it (Release), and a press the browser ends (a page pan, a
   * lost capture) puts it back (Cancel). The press owns the grip until it
   * ends: a press of another pointer meanwhile grabs nothing (`followed`).
   */
  const follow = (down: PointerEvent) => {
    following = Option.some(
      Effect.runForkWith(meta.host)(
        Pointer.use((pointer) =>
          pointer.drag(down, {
            move: (e) =>
              send(EditEvent.Move({ pointer: { x: e.clientX, y: e.clientY, shift: e.shiftKey } })),
            end: (lifted) => {
              following = Option.none();
              send(
                Option.match(lifted, {
                  onNone: () => EditEvent.Cancel,
                  onSome: () => EditEvent.Release,
                }),
              );
            },
          }),
        ),
      ),
    );
  };
  /** Whether a press's drag is still followed: then another pointer's press is not taken. */
  const followed = () => Option.isSome(following);

  const press = (p: Press) => {
    if (followed()) return;
    labActions.select(Option.some(cueOf(p.scene, p.cue)));
    const refused = cueRefusal(stripSource().source, stripSource().error, p.cue, p.edge);
    if (Option.isSome(refused)) return send(EditEvent.Refuse({ message: refused.value }));
    const placed = Result.getSuccess(sceneOf(film.placed, p.scene));
    const cues = stage.cuesOf(p.scene);
    const timeline = stage.timelineOf(p.scene);
    const grip = Option.all({
      placed,
      span: Option.fromUndefinedOr(timeline[p.cue]),
      cue0: Option.fromUndefinedOr(cues.get(p.cue)),
    });
    Option.map(grip, (g) => {
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
      );
      follow(p.down);
    });
  };

  const grabKnob = (p: KnobPress) => {
    if (followed()) return;
    labActions.select(Option.some(knobOf(p.scene, p.knob)));
    const refused = knobRefusal(stripSource().source, stripSource().error, p.knob);
    if (Option.isSome(refused)) return send(EditEvent.Refuse({ message: refused.value }));
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
          start: filmPoint(frame, { x: p.down.clientX, y: p.down.clientY, shift: false }),
          knobs,
        }),
      }),
    );
    follow(p.down);
  };

  // A grip let go no longer follows its press.
  const holding = createMemo(() => edit()._tag === 'Pressed' || edit()._tag === 'Dragging');
  createEffect(holding, (held) => {
    if (!held) letGo();
  });
  onCleanup(letGo);

  // Each step is its own request, with an id no other has: with no answer, the lab says by it whether it landed.
  const step = (verb: StepVerb) =>
    send(EditEvent.Step({ verb, request: Effect.runSync(stepRequest) }));
  const commit = (write: Write, shown: SceneEdit) => send(EditEvent.Commit({ write, edit: shown }));

  /** What the lab knows of `scene`'s source: the inspected scene's, else the strip's. */
  const sourceOf = (scene: string): Known =>
    Option.getOrElse(
      Option.fromUndefinedOr(
        [inspectedSource(), stripSource()][[inspected(), stripScene()].indexOf(scene)],
      ),
      (): Known => ({
        source: Option.none(),
        error: `${scene} is neither inspected nor on the strip`,
      }),
    );

  /** The inspector's fields of `s`, read again with each reload. */
  const fieldsAt = (s: LabSelection): ReadonlyArray<Inspected> => {
    lab.revision();
    const known = sourceOf(s.scene);
    return fieldsOf(s, {
      timeline: stage.timelineOf(s.scene),
      cues: stage.cuesOf(s.scene),
      knobs: stage.knobsOf(s.scene),
      source: known.source,
      error: known.error,
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

  /** The film times at which the strip scene's cues start or end, in order, each once. */
  const edges = (): ReadonlyArray<number> => {
    lab.revision();
    const scene = stripScene();
    const start = Option.match(Result.getSuccess(sceneOf(film.placed, scene)), {
      onNone: () => 0,
      onSome: (p) => p.start,
    });
    const times = [...stage.cuesOf(scene).values()].flatMap((c) => [
      start + c.start,
      start + c.end,
    ]);
    return [...new Set(times)].toSorted((a, b) => a - b);
  };

  // The editor's verbs on the page's hub: Undo (⌘Z) and Redo (⇧⌘Z) while the
  // server's stack has a step, Escape letting a held grip go (from a field
  // too), Select, the nudges and the walk through the strip's cues.
  onCleanup(
    meta.hub.commands.register(
      ...editorCommands({
        undoable: (verb) => Option.flatMap(report(), (r) => Option.fromUndefinedOr(r[verb])),
        step,
        holding,
        cancel: () => send(EditEvent.Cancel),
        selected: lab.selection,
        select: (s) => labActions.select(Option.some(s)),
        fieldsOf: fieldsAt,
        stripCues,
        edges,
        T: lab.T,
        seek: (T) => meta.player.seek(T),
      }),
    ),
  );

  const value: EditorContextValue = {
    state: {
      status: () => statusText(edit(), report()),
      findings: () => findingsOf(edit(), report()),
      stripScene,
      inspected,
      stripSource,
      inspectedSource,
      report,
      fieldsOf: fieldsAt,
    },
    actions: {
      press,
      grabKnob,
      commit,
      step,
      refuse: (message) => send(EditEvent.Refuse({ message })),
    },
  };
  return <EditorContext value={value}>{props.children}</EditorContext>;
};

const Ready = (
  props: ParentProps<{ readonly actor: Atom.Atom<AsyncResult.AsyncResult<EditActor, never>> }>,
) => {
  const actor = useAtomSuspense(() => props.actor);
  return (
    <Show when={actor()} keyed>
      {(a: EditActor) => <Body actor={a}>{props.children}</Body>}
    </Show>
  );
};

/** The editor's state and actions, for the strip and the inspector inside it. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const actor = meta.runtime.atom(Machine.scoped(spawnEditor));
  return (
    <Loading>
      <Ready actor={actor}>{props.children}</Ready>
    </Loading>
  );
};
