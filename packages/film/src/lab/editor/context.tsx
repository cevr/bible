// The editor's provider: its machine's actor (one per lab page, run on the
// shell's runtime), the scene the strip shows, what the lab knows of that
// scene's source and of the selected scene's, and the film's check. The strip,
// the inspector and the knobs (rows and handles) read this context and send
// the machine events; none holds state of its own, nor reaches into another
// panel's.
//
// A drag listens on the window while the machine is Pressed or Dragging, and
// only then: the listeners come and go with the state.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Option, Result } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, onCleanup, useContext } from 'solid-js';
import type { SceneEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { CheckLine, CheckReport, SceneSource } from '../../core/schema.ts';
import type { DragEdge } from '../../core/timeline.ts';
import { LabApi, type StepVerb, reasonOf } from '../api.ts';
import { useLab } from '../shell.tsx';
import {
  CueGrip,
  KnobGrip,
  type Write,
  cueRefusal,
  filmPoint,
  knobRefusal,
  snapTargets,
} from './grip.ts';
import { type Handle, knobMode } from './handles.ts';
import { findingsOf, statusText } from './format.ts';
import { type EditActor, EditEvent, spawnEditor } from './machine.ts';

/** What the lab knows of a scene's source: it, or why it could not be read. */
export interface Known {
  readonly source: Option.Option<SceneSource>;
  /** The server's reason, when the source could not be read. */
  readonly error: string;
}

export interface EditorState {
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
}

/** Where on a cue's bar a press landed, and the strip's scale. */
export interface Press {
  readonly scene: string;
  readonly cue: string;
  readonly edge: DragEdge;
  readonly x: number;
  /** Screen pixels per scene second on the strip. */
  readonly perSec: number;
}

/** The overlay's screen box. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A press on a knob's handle on the frame: which, where it sits, and the overlay's screen box. */
export interface KnobPress {
  readonly scene: string;
  readonly knob: string;
  readonly handle: Handle;
  readonly box: Box;
  /** The pointer, in screen pixels. */
  readonly x: number;
  readonly y: number;
}

export interface EditorActions {
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

export interface EditorContextValue {
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

  const stripScene = createMemo(() => film.sceneAt(lab.T()).spec.id);
  const inspected = createMemo(() =>
    Option.match(lab.selection(), { onNone: stripScene, onSome: (s) => s.scene }),
  );
  const stripResult = useAtomValue(() => sources(stripScene()));
  const inspectedResult = useAtomValue(() => sources(inspected()));
  const stripSource = createMemo(() => knownOf(stripResult()));
  const inspectedSource = createMemo(() => knownOf(inspectedResult()));
  const checked = useAtomValue(() => checkAtom);
  const report = createMemo(() => AsyncResult.value(checked()));

  const press = (p: Press) => {
    labActions.select(Option.some({ kind: 'cue', scene: p.scene, name: p.cue }));
    const refused = cueRefusal(stripSource().source, stripSource().error, p.cue, p.edge);
    if (Option.isSome(refused)) return send(EditEvent.Refuse({ message: refused.value }));
    const placed = Result.getSuccess(sceneOf(film.placed, p.scene));
    const cues = film.cuesOf(p.scene);
    const timeline = stage.timelineOf(p.scene);
    const grip = Option.all({
      placed,
      span: Option.fromUndefinedOr(timeline[p.cue]),
      cue0: Option.fromUndefinedOr(cues.get(p.cue)),
    });
    Option.map(grip, (g) =>
      send(
        EditEvent.Press({
          grip: CueGrip.make({
            scene: p.scene,
            cue: p.cue,
            edge: p.edge,
            x0: p.x,
            perSec: p.perSec,
            fps: film.fps,
            span: g.span,
            timeline,
            cue0: g.cue0,
            targets: snapTargets(g.placed, cues, p.cue),
          }),
        }),
      ),
    );
  };

  const grabKnob = (p: KnobPress) => {
    labActions.select(Option.some({ kind: 'knob', scene: p.scene, name: p.knob }));
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
          start: filmPoint(frame, { x: p.x, y: p.y, shift: false }),
          knobs,
        }),
      }),
    );
  };

  // A grip follows the pointer on the window while it is held, and Escape lets it go.
  const holding = createMemo(() => edit()._tag === 'Pressed' || edit()._tag === 'Dragging');
  createEffect(holding, (held) => {
    if (!held) return;
    const move = (e: PointerEvent) =>
      send(EditEvent.Move({ pointer: { x: e.clientX, y: e.clientY, shift: e.shiftKey } }));
    const up = () => send(EditEvent.Release);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') send(EditEvent.Cancel);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });

  const step = (verb: StepVerb) => send(EditEvent.Step({ verb }));
  // ⌘Z undoes and ⇧⌘Z redoes, outside a field being typed in.
  const undoKeys = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) return step('redo');
    step('undo');
  };
  window.addEventListener('keydown', undoKeys);
  onCleanup(() => window.removeEventListener('keydown', undoKeys));

  const value: EditorContextValue = {
    state: {
      status: () => statusText(edit(), report()),
      findings: () => findingsOf(edit(), report()),
      stripScene,
      inspected,
      stripSource,
      inspectedSource,
      report,
    },
    actions: {
      press,
      grabKnob,
      commit: (write, shown) => send(EditEvent.Commit({ write, edit: shown })),
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
