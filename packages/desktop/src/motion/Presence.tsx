/* <Presence> — wraps @solid-primitives/transition-group's createSwitchTransition
   to gate enter/exit. Children that opt in (via <Motion> reading the
   PresenceContext) animate to their `exit` target before the parent removes
   them from the DOM.

   Mirrors solid-motionone's approach — proven library, ~1KB. mode='wait'
   is the equivalent of framer-motion's exitBeforeEnter (next enter waits
   for current exit), 'sync' runs them concurrently. */
import { resolveFirst } from '@solid-primitives/refs';
import { createSwitchTransition } from '@solid-primitives/transition-group';
import {
  createContext,
  createSignal,
  useContext,
  type Accessor,
  type FlowComponent,
  type JSX,
} from 'solid-js';

export type PresenceState = {
  /** True on the very first render — children skip enter animation if false. */
  initial: boolean;
  /** Per-child mounted signal: false during exit so the child knows to
      animate out instead of in. */
  mount: Accessor<boolean>;
};

export const PresenceContext = createContext<PresenceState>();

/** Children pull this to know if they should animate-in (true) or
    animate-out (false). Returns undefined when not inside <Presence>. */
export const usePresence = (): PresenceState | undefined => useContext(PresenceContext);

/** Per-element exit registry: <Motion> registers an exit-runner here on
    mount, <Presence> calls it on remove and waits for the returned promise
    before letting the element unmount. */
const exitRunners = new WeakMap<Element, () => Promise<void>>();

export const registerExit = (el: Element, run: () => Promise<void>): void => {
  exitRunners.set(el, run);
};

export const Presence: FlowComponent<{
  initial?: boolean;
  mode?: 'sync' | 'wait';
}> = (props) => {
  const [mount, setMount] = createSignal(true);
  const state: PresenceState = {
    initial: props.initial ?? true,
    mount,
  };

  const transition = createSwitchTransition(
    resolveFirst(() => props.children),
    {
      appear: state.initial,
      mode: props.mode === 'wait' ? 'out-in' : 'parallel',
      onExit(el, done) {
        setMount(false);
        const runner = exitRunners.get(el);
        if (runner === undefined) {
          done();
          return;
        }
        runner().then(done).catch(done);
      },
      onEnter(_, done) {
        setMount(true);
        done();
      },
    },
  );

  const render = (
    <PresenceContext.Provider value={state}>
      {
        /* createSwitchTransition returns Accessor<Element[]>; Solid JSX
           renders accessor-of-array at runtime but JSX.Element is just
           Element. Single boundary cast keeps the surface clean. */
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        transition as unknown as JSX.Element
      }
    </PresenceContext.Provider>
  );

  /* After first render, subsequent enters should always animate. */
  state.initial = true;
  return render;
};
