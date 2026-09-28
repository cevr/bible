// The editor's provider: its machine's actor (one per lab page, run on the
// shell's runtime), the scene the strip shows, what the lab knows of that
// scene's source and of the selected scene's, and the film's check. The strip
// and the inspector read this context and send the machine events; neither
// holds state of its own, nor reaches into another panel's.
//
// A drag listens on the window while the machine is Pressed or Dragging, and
// only then: the listeners come and go with the state.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Cause, Option, Result, Schema } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';
import * as Atom from 'effect/unstable/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, onCleanup, useContext } from 'solid-js';
import type { SceneEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { CheckReport, SceneSource } from '../../core/schema.ts';
import type { DragEdge } from '../../core/timeline.ts';
import { LabApi, type StepVerb } from '../api.ts';
import { useLab } from '../shell.tsx';
import { CueGrip, type Write, cueRefusal, snapTargets } from './grip.ts';
import { type EditActor, EditEvent, type EditState, spawnEditor } from './machine.ts';

/** What the lab knows of a scene's source: it, or why it could not be read. */
export interface Known {
  readonly source: Option.Option<SceneSource>;
  /** The server's reason, when the source could not be read. */
  readonly error: string;
}

export interface EditorState {
  readonly edit: Accessor<EditState>;
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

export interface EditorActions {
  /** A press on a cue's bar: select it, and grab it (or say why it cannot be dragged). */
  readonly press: (press: Press) => void;
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

/** A failed read, in the server's words without its tag (`SceneNotFound: …` reads `…`). */
const reason = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  const text = Result.match(
    Schema.decodeUnknownResult(Schema.Struct({ message: Schema.String }))(squashed),
    {
      onFailure: () => String(squashed),
      onSuccess: (e) => e.message,
    },
  );
  return text.replace(/^\w+: /, '');
};

const knownOf = (result: AsyncResult.AsyncResult<SceneSource, unknown>): Known =>
  AsyncResult.match(result, {
    onInitial: () => ({ source: Option.none(), error: '' }),
    onFailure: (f) => ({ source: Option.none(), error: reason(f.cause) }),
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
    state: { edit, stripScene, inspected, stripSource, inspectedSource, report },
    actions: {
      press,
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
