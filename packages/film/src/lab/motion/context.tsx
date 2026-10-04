// Motion's provider: the loop's machine (one actor per lab page, on the
// shell's runtime), the speed, and the onion skin's settings, each kept in
// the view through the reload a write causes. The section and the onion
// layer read this context and act through it; neither holds state of its
// own. The loop the machine is in plays through the player's clock each
// frame (`rangeOf`: a looped cue follows its edits).

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import type * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import type { LoopRange } from '../../player/main.ts';
import type { LabView } from '../view-state.ts';
import type { LabSelection } from '../../command/selection.ts';
import { useLab } from '../shell.tsx';
import {
  type LoopActor,
  LoopEvent,
  loopFromView,
  loopText,
  loopView,
  rangeOf,
  spawnLoop,
} from './loop.ts';

type Rate = LabView['rate'];
type OnionView = LabView['onion'];

interface MotionState {
  readonly rate: Accessor<Rate>;
  readonly onion: Accessor<OnionView>;
  /** The cue a loop would play: the one selected, if a cue is. */
  readonly cue: Accessor<Option.Option<LabSelection>>;
  /** What the section says: the loop, and the speed when it mutes the narration. */
  readonly status: Accessor<string>;
}

interface MotionActions {
  /** Mark A, or B, at the frame shown. */
  readonly markA: () => void;
  readonly markB: () => void;
  /** Loop the selected cue. */
  readonly loopCue: () => void;
  readonly stopLoop: () => void;
  readonly setRate: (rate: Rate) => void;
  readonly setOnion: (change: Partial<OnionView>) => void;
}

interface MotionContextValue {
  readonly state: MotionState;
  readonly actions: MotionActions;
}

const MotionContext = createContext<MotionContextValue>();

/** Motion's context: only inside `<Motion.Provider>`. */
export const useMotion = (): MotionContextValue => useContext(MotionContext);

const sameRange = (a: Option.Option<LoopRange>, b: Option.Option<LoopRange>) =>
  Option.makeEquivalence((x: LoopRange, y: LoopRange) => x.from === y.from && x.to === y.to)(a, b);

const Body = (props: ParentProps<{ readonly actor: LoopActor }>) => {
  const { state: lab, meta } = useLab();
  const { player, stage, view } = meta;
  const stateAtom = ActorAtom.make(props.actor);
  const loop = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);

  // The loop plays through the player's clock, following a looped cue's edits frame by frame.
  let looping = Option.none<LoopRange>();
  createEffect(
    () => {
      lab.drawn();
      lab.revision();
      return rangeOf(loop(), stage);
    },
    (range) => {
      if (sameRange(range, looping)) return;
      looping = range;
      player.setLoop(Option.getOrUndefined(range));
    },
  );
  createEffect(loop, (s) => view.patch({ loop: loopView(s) }));

  const [rate, setRateSignal] = createSignal<Rate>(view.get().rate);
  createEffect(rate, (r) => {
    player.setRate(r);
    view.patch({ rate: r });
  });
  const [onion, setOnionSignal] = createSignal<OnionView>(view.get().onion);
  createEffect(onion, (o) => view.patch({ onion: o }));

  const cue = createMemo(() => Option.filter(lab.selection(), (s) => s._tag === 'Cue'));
  const status = createMemo(() => {
    const r = rate();
    const muted = Option.liftPredicate(`${r}×: narration muted`, () => r !== 1);
    return [loopText(loop()), ...Option.toArray(muted)].filter((s) => s !== '').join(' · ');
  });

  const value: MotionContextValue = {
    state: { rate, onion, cue, status },
    actions: {
      markA: () => send(LoopEvent.MarkA({ t: player.now() })),
      markB: () => send(LoopEvent.MarkB({ t: player.now() })),
      loopCue: () =>
        Option.map(cue(), (c) => send(LoopEvent.LoopCue({ scene: c.scene, name: c.name }))),
      stopLoop: () => send(LoopEvent.Stop),
      setRate: (r) => setRateSignal(r),
      setOnion: (change) => setOnionSignal((o) => ({ ...o, ...change })),
    },
  };
  return <MotionContext value={value}>{props.children}</MotionContext>;
};

const Ready = (
  props: ParentProps<{ readonly actor: Atom.Atom<AsyncResult.AsyncResult<LoopActor, never>> }>,
) => {
  const actor = useAtomSuspense(() => props.actor);
  return (
    <Show when={actor()} keyed>
      {(a: LoopActor) => <Body actor={a}>{props.children}</Body>}
    </Show>
  );
};

/** Motion's state and actions, for its section and its onion layer. */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const initial = loopFromView(Option.fromUndefinedOr(meta.view.get().loop));
  const actor = meta.runtime.atom(Machine.scoped(spawnLoop(initial)));
  return (
    <Loading>
      <Ready actor={actor}>{props.children}</Ready>
    </Loading>
  );
};
