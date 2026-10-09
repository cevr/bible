// Upstream: packages/react/src/internals/useTransitionStatus.ts,
// packages/react/src/internals/useAnimationsFinished.ts,
// packages/react/src/internals/useOpenChangeComplete.tsx,
// packages/react/src/internals/useUnmountAfterClose.ts,
// packages/react/src/utils/getFiniteAnimations.ts,
// packages/react/src/internals/stateAttributesMapping.ts,
// packages/react/src/internals/TransitionStatusDataAttributes.ts
//
// A popup's enter and exit transitions. Opening mounts it with
// `data-starting-style` for one frame (so a CSS transition has a start);
// closing keeps it mounted with `data-ending-style` until its CSS
// animations and transitions finish, then unmounts it.
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';

import { NOOP } from '../utils/dom.ts';
import { useAnimationFrame } from '../utils/timers.ts';
import type { StateAttributesMapping } from './getStateAttributesProps.ts';

export type TransitionStatus = 'starting' | 'ending' | undefined;

export const TransitionStatusDataAttributes = {
  startingStyle: 'data-starting-style',
  endingStyle: 'data-ending-style',
} as const;

const STARTING_HOOK = { [TransitionStatusDataAttributes.startingStyle]: '' };
const ENDING_HOOK = { [TransitionStatusDataAttributes.endingStyle]: '' };

export const transitionStatusMapping: StateAttributesMapping<{
  transitionStatus: TransitionStatus;
}> = {
  transitionStatus(value) {
    if (value === 'starting') {
      return STARTING_HOOK;
    }
    if (value === 'ending') {
      return ENDING_HOOK;
    }
    return null;
  },
};

interface TransitionStatusReturn {
  mounted: Accessor<boolean>;
  transitionStatus: Accessor<TransitionStatus>;
  /** Unmounts a closed popup (the exit transition is done). */
  unmount(): void;
}

/**
 * Mounting and the transition status for an `open` flag: mounted while open
 * and until `unmount()` after it closes; `starting` for the first frame
 * after opening, `ending` while closed but mounted. A popup open from the
 * start shows no starting frame.
 */
function createTransitionStatus(open: Accessor<boolean>): TransitionStatusReturn {
  const initiallyOpen = untrack(open);
  const [kept, setKept] = createSignal(initiallyOpen);
  const [started, setStarted] = createSignal(initiallyOpen);
  const frame = useAnimationFrame();

  const mounted = createMemo(() => open() || kept());
  const transitionStatus = createMemo<TransitionStatus>(() => {
    if (open()) {
      return started() ? undefined : 'starting';
    }
    return mounted() ? 'ending' : undefined;
  });

  createEffect(open, (isOpen) => {
    frame.cancel();
    if (isOpen) {
      setKept(true);
      frame.request(() => setStarted(true));
    } else {
      setStarted(false);
    }
  });

  return {
    mounted,
    transitionStatus,
    unmount() {
      if (!untrack(open)) {
        setKept(false);
      }
    },
  };
}

function getFiniteAnimations(element: Element): Animation[] {
  return element.getAnimations().filter((animation) => {
    const timing = animation.effect?.getTiming();
    return timing?.duration !== Infinity && timing?.iterations !== Infinity;
  });
}

/**
 * Returns a function that runs a callback once the element's finite CSS
 * animations and transitions finish (on the next frame, so ones that just
 * started are seen).
 */
function useAnimationsFinished(element: Accessor<HTMLElement | null | undefined>) {
  const frame = useAnimationFrame();

  return (fnToExecute: () => void, signal: AbortSignal | null = null) => {
    frame.cancel();
    const resolvedElement = untrack(element);
    if (resolvedElement == null) {
      return;
    }

    if (typeof resolvedElement.getAnimations !== 'function') {
      fnToExecute();
      return;
    }

    const exec = () => {
      Promise.all(
        getFiniteAnimations(resolvedElement).map((animation) => animation.finished.then(NOOP)),
      ).then(
        () => {
          if (!signal?.aborted) {
            fnToExecute();
          }
        },
        () => {
          if (signal?.aborted) {
            return;
          }
          const current = getFiniteAnimations(resolvedElement);
          if (current.some((a) => a.pending || a.playState !== 'finished')) {
            exec();
            return;
          }
          fnToExecute();
        },
      );
    };

    frame.request(exec);
  };
}

interface OpenChangeCompleteParameters {
  enabled?: Accessor<boolean> | undefined;
  open: Accessor<boolean>;
  element: Accessor<HTMLElement | null | undefined>;
  onComplete: () => void;
}

/** Calls `onComplete` once the element's animations finish after each change of `open`. */
export function useOpenChangeComplete(parameters: OpenChangeCompleteParameters) {
  const { enabled = () => true, open, element, onComplete } = parameters;
  const runOnceAnimationsFinish = useAnimationsFinished(element);

  createEffect(
    () => [enabled(), open()] as const,
    ([isEnabled]) => {
      if (!isEnabled) {
        return undefined;
      }
      const abortController = new AbortController();
      runOnceAnimationsFinish(onComplete, abortController.signal);
      return () => abortController.abort();
    },
  );
}

interface UnmountAfterCloseParameters {
  open: Accessor<boolean>;
  element: Accessor<HTMLElement | null | undefined>;
  onUnmount: () => void;
}

/** `createTransitionStatus`, unmounting once the exit animations finish. */
export function createUnmountAfterClose(parameters: UnmountAfterCloseParameters) {
  const { open, element, onUnmount } = parameters;
  const status = createTransitionStatus(open);

  useOpenChangeComplete({
    enabled: () => status.mounted() && !open(),
    open,
    element,
    onComplete() {
      if (!untrack(status.mounted) || untrack(open)) {
        return;
      }
      status.unmount();
      onUnmount();
    },
  });

  return status;
}
