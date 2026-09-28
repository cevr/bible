// Compare's provider: its machine (one actor per lab page, on the shell's
// runtime), the scene under the playhead, and that scene at HEAD (read from
// the lab API only once a mode is on, and once per scene). The section, the
// HEAD layer and the wipe's divider read this context and act through it.
// The view keeps the mode and the divider through the reload a write causes.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Option, Result } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';
import * as Atom from 'effect/unstable/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, useContext } from 'solid-js';
import type { SceneEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { HeadSource } from '../../core/schema.ts';
import { LabApi, type LabFailure } from '../api.ts';
import { useLab } from '../shell.tsx';
import { compareText, headEdit } from './head.ts';
import {
  type CompareActor,
  CompareEvent,
  type CompareMode,
  type CompareState,
  compareFromView,
  compareView,
  modeOf,
  spawnCompare,
} from './machine.ts';

export interface CompareStateValue {
  readonly compare: Accessor<CompareState>;
  /** The scene under the playhead. */
  readonly scene: Accessor<string>;
  /** That scene at HEAD, as the lab API gave it (initial while off). */
  readonly head: Accessor<AsyncResult.AsyncResult<HeadSource, LabFailure>>;
  /** HEAD drawn through today's code, once HEAD has been read. */
  readonly edit: Accessor<Option.Option<SceneEdit>>;
  /** What the section says. */
  readonly status: Accessor<string>;
}

export interface CompareActions {
  readonly choose: (mode: CompareMode) => void;
  /** The divider dragged to `split`, 0–1 across the frame. */
  readonly split: (split: number) => void;
}

export interface CompareContextValue {
  readonly state: CompareStateValue;
  readonly actions: CompareActions;
}

const CompareContext = createContext<CompareContextValue>();

/** Compare's context: only inside `<Compare.Provider>`. */
export const useCompare = (): CompareContextValue => useContext(CompareContext);

/** HEAD not asked for: the compare is off. */
const unread = Atom.make(AsyncResult.initial<HeadSource, LabFailure>());

const Body = (props: ParentProps<{ readonly actor: CompareActor }>) => {
  const { state: lab, meta } = useLab();
  const { film, runtime, view } = meta;
  const stateAtom = ActorAtom.make(props.actor);
  const compare = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);

  const heads = Atom.family((scene: string) => runtime.atom(LabApi.use((api) => api.head(scene))));
  const scene = createMemo(() => film.sceneAt(lab.T()).spec.id);
  const mode = createMemo(() => modeOf(compare()));
  const head = useAtomValue(() => {
    if (mode() === 'off') return unread;
    return heads(scene());
  });
  const edit = createMemo(() =>
    Option.map(AsyncResult.value(head()), (h) =>
      headEdit(
        Option.map(Result.getSuccess(sceneOf(film.placed, scene())), (p) => p.spec),
        h,
      ),
    ),
  );
  const status = createMemo(() => compareText(mode(), scene(), head()));
  createEffect(compare, (s) => view.patch({ compare: compareView(s) }));

  const value: CompareContextValue = {
    state: { compare, scene, head, edit, status },
    actions: {
      choose: (m) => send(CompareEvent.Choose({ mode: m })),
      split: (split) => send(CompareEvent.Split({ split })),
    },
  };
  return <CompareContext value={value}>{props.children}</CompareContext>;
};

const Ready = (
  props: ParentProps<{
    readonly actor: Atom.Atom<AsyncResult.AsyncResult<CompareActor, never>>;
  }>,
) => {
  const actor = useAtomSuspense(() => props.actor);
  return (
    <Show when={actor()} keyed>
      {(a: CompareActor) => <Body actor={a}>{props.children}</Body>}
    </Show>
  );
};

/** Compare's state and actions, for its section, its HEAD layer and its divider. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const actor = meta.runtime.atom(
    Machine.scoped(spawnCompare(compareFromView(meta.view.get().compare))),
  );
  return (
    <Loading>
      <Ready actor={actor}>{props.children}</Ready>
    </Loading>
  );
};
