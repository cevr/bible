// Compare's provider: its machine (one actor per lab page, on the shell's
// runtime), the scene under the playhead, and that scene at HEAD (read from
// the lab API only once a mode is on, then once per scene until it is turned
// off). The section, the
// HEAD layer and the wipe's divider read this context and act through it.
// The mode is the link's (`?view=`, PA-9): a mode chosen writes it in place,
// and a link that names another (Back to an entry made in another mode)
// chooses it. The view keeps the divider through the reload a write causes.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Option, Result } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, untrack, useContext } from 'solid-js';
import type { ShownEdit } from '../../canvas/film.ts';
import { sceneOf } from '../../core/layout.ts';
import type { HeadSource } from '../../core/schema.ts';
import { LabApi, type LabFailure } from '../api.ts';
import { useLab } from '../shell.tsx';
import { compareText, headEdit } from './head.ts';
import {
  type CompareActor,
  CompareEvent,
  type CompareMode,
  type HeadLayer,
  blendOf,
  compareAt,
  compareView,
  layerOf,
  modeOf,
  spawnCompare,
  splitOf,
} from './machine.ts';

interface CompareStateValue {
  /** The mode chosen: off, wipe, blink or diff. */
  readonly mode: Accessor<CompareMode>;
  /** What the HEAD layer shows now: nothing, HEAD, or now (a blink's other side). */
  readonly layer: Accessor<HeadLayer>;
  /** How the HEAD layer meets the frame: the difference blend in a diff. */
  readonly blend: Accessor<'difference' | 'normal'>;
  /** Where the wipe's divider sits, 0–1 across the frame: only while wiping. */
  readonly split: Accessor<Option.Option<number>>;
  /** The scene under the playhead (`LabState.scene`). */
  readonly scene: Accessor<string>;
  /** HEAD drawn through today's code, once HEAD has been read and resolves on today's narration. */
  readonly edit: Accessor<Option.Option<ShownEdit>>;
  /** What the section says. */
  readonly status: Accessor<string>;
}

interface CompareActions {
  readonly choose: (mode: CompareMode) => void;
  /** The divider dragged to `split`, 0–1 across the frame. */
  readonly split: (split: number) => void;
  /** A press on the frame held (`on`) or let go: in a blink, HEAD shows while held. */
  readonly hold: (on: boolean) => void;
}

interface CompareContextValue {
  readonly state: CompareStateValue;
  readonly actions: CompareActions;
}

const CompareContext = createContext<CompareContextValue>();

/** Compare's context: only inside `<Compare.Provider>`. */
export const useCompare = (): CompareContextValue => useContext(CompareContext);

/** HEAD not asked for: the compare is off. */
const unread = Atom.make(AsyncResult.initial<HeadSource, LabFailure>());

const Body = (props: ParentProps<{ readonly actor: CompareActor }>) => {
  const { state: lab, actions: labActions, meta } = useLab();
  const { film, runtime, view } = meta;
  const stateAtom = ActorAtom.make(props.actor);
  const compare = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);

  const scene = lab.scene;
  const mode = createMemo(() => modeOf(compare()));
  const on = createMemo(() => mode() !== 'off');
  // HEAD as read since compare last turned on, once per scene: turning it
  // off and on reads HEAD again, so a commit made since shows.
  const heads = createMemo(() => {
    on();
    return Atom.family((s: string) => runtime.atom(LabApi.use((api) => api.head(s))));
  });
  const head = useAtomValue(() => {
    if (!on()) return unread;
    return heads()(scene());
  });
  // HEAD's edit, resolved once where it is made: a timeline that names what
  // today's narration lacks is a reason the status gives, and no layer.
  const resolved = createMemo(() =>
    Option.map(AsyncResult.value(head()), (h) =>
      film.edit(
        scene(),
        headEdit(
          Option.map(Result.getSuccess(sceneOf(film.placed, scene())), (p) => p.spec),
          h,
        ),
      ),
    ),
  );
  const edit = createMemo(() => Option.flatMap(resolved(), Result.getSuccess));
  const status = createMemo(() =>
    compareText(mode(), scene(), head(), Option.flatMap(resolved(), Result.getFailure)),
  );
  createEffect(compare, (s) => view.patch({ compare: compareView(s) }));
  // The link and the machine agree on the mode: each follows the other only
  // where they differ, so neither write echoes. The owner's pick is an entry
  // of its own (`choose`, below); the mode moving otherwise is written in place.
  createEffect(mode, (m) => {
    if (m !== untrack(lab.view)) labActions.keepCompare(m);
  });
  createEffect(lab.view, (v) => {
    if (v !== untrack(mode)) send(CompareEvent.Choose({ mode: v }));
  });

  const value: CompareContextValue = {
    state: {
      mode,
      layer: () => layerOf(compare()),
      blend: () => blendOf(compare()),
      split: () => splitOf(compare()),
      scene,
      edit,
      status,
    },
    actions: {
      choose: (m) => {
        labActions.compareBy(m);
        send(CompareEvent.Choose({ mode: m }));
      },
      split: (split) => send(CompareEvent.Split({ split })),
      hold: (on) => send(CompareEvent.Hold({ on })),
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
  const { state, meta } = useLab();
  const actor = meta.runtime.atom(
    Machine.scoped(spawnCompare(compareAt(untrack(state.view), meta.view.get().compare))),
  );
  return (
    <Loading>
      <Ready actor={actor}>{props.children}</Ready>
    </Loading>
  );
};
