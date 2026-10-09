// Upstream: packages/react/src/number-field/scrub-area/NumberFieldScrubArea.tsx
//
// An area the user presses and drags across to change the value: every
// 2 pixels of horizontal movement step the value by the movement times the
// step (Shift: `largeStep`, Alt: `smallStep`), and the release commits. A mouse press focuses the input and asks for pointer
// lock, so the drag is not stopped by the screen's edge. WebKit and touch
// scrub without pointer lock. A press that does not move clicks its target.
// Upstream's `ScrubAreaCursor`, the virtual cursor drawn under the lock, is
// left out, and so are its vertical `direction` and its `pixelSensitivity`.
// Renders a `<span>`.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit, onCleanup, untrack } from 'solid-js';

import { createGenericEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import {
  addEventListener,
  getTarget,
  mergeCleanups,
  ownerDocument,
  ownerWindow,
} from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext.ts';
import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';
import { getKeyState } from '../utils/types.ts';

const SCRUB_AREA_STYLE: JSX.CSSProperties = {
  'touch-action': 'none',
  '-webkit-user-select': 'none',
  'user-select': 'none',
};

// How many pixels the pointer moves before the value changes.
const PIXEL_SENSITIVITY = 2;

interface NumberFieldScrubAreaState extends NumberFieldRootState {}

interface NumberFieldScrubAreaProps extends BaseUIComponentProps<
  'span',
  NumberFieldScrubAreaState
> {}

export function NumberFieldScrubArea(componentProps: NumberFieldScrubAreaProps): JSX.Element {
  const ctx = useNumberFieldRootContext();
  const state = ctx.state;
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  const [scrubAreaElement, setScrubAreaElement] = createSignal<HTMLSpanElement | null>(null, {
    ownedWrite: true,
  });
  const [isScrubbing, setIsScrubbing] = createSignal(false, { ownedWrite: true });
  let isTouchInput = false;
  let isScrubbingNow = false;
  // Counts scrubs ended or canceled: a lock request made during an earlier count is stale.
  let scrubSession = 0;
  let didMove = false;
  let pointerDownTarget: EventTarget | null = null;
  const exitPointerLockTimeout = useTimeout();

  const onScrubbingChange = (scrubbing: boolean) => {
    setIsScrubbing(scrubbing);
    ctx.setScrubbing(scrubbing);
  };

  const exitPointerLock = () => {
    try {
      ownerDocument(untrack(scrubAreaElement)).exitPointerLock();
    } catch {
      // Not locked, or not lockable here.
    }
  };

  const endScrub = (event: PointerEvent) => {
    // The locked body, or a touch press whose touchstart was prevented, kept the
    // native click from the target; otherwise the browser clicks it itself.
    const clickWithheld =
      ownerDocument(untrack(scrubAreaElement)).pointerLockElement != null || isTouchInput;
    exitPointerLock();
    isScrubbingNow = false;
    scrubSession += 1;
    onScrubbingChange(false);
    ctx.onValueCommitted(ctx.currentValue(), createGenericEventDetails(REASONS.scrub, event));
    // A press that did not move is a click, sent here only when the browser withheld its own.
    const input = untrack(ctx.inputElement);
    if (clickWithheld && !didMove && pointerDownTarget != null && input) {
      pointerDownTarget.dispatchEvent(
        new (ownerWindow(input).MouseEvent)('click', { bubbles: true, cancelable: true }),
      );
    }
    didMove = false;
    pointerDownTarget = null;
  };

  const scrubBy = (event: PointerEvent, cumulativeDelta: number): number => {
    const next = cumulativeDelta + event.movementX;
    if (Math.abs(next) < PIXEL_SENSITIVITY) {
      return next;
    }
    didMove = true;
    const rawAmount = event.movementX * ctx.getStepAmount(getKeyState(event));
    if (rawAmount !== 0) {
      ctx.stopTyping();
      ctx.incrementValue(Math.abs(rawAmount), {
        direction: rawAmount >= 0 ? 1 : -1,
        event,
        reason: REASONS.scrub,
      });
    }
    return 0;
  };

  // Window listeners only while scrubbing, so an unrelated release does not commit.
  createEffect(
    () => [ctx.inputElement(), state.disabled, isScrubbing()] as const,
    ([input, disabled, scrubbing]) => {
      if (!input || disabled || !scrubbing) {
        return undefined;
      }
      let cumulativeDelta = 0;
      const onPointerUp = (event: PointerEvent) => {
        if (platform.engine.gecko) {
          // Firefox keeps the pointer lock after a soft click without a short delay.
          exitPointerLockTimeout.start(20, () => endScrub(event));
        } else {
          endScrub(event);
        }
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!isScrubbingNow) {
          return;
        }
        // No text selection.
        event.preventDefault();
        cumulativeDelta = scrubBy(event, cumulativeDelta);
      };
      const win = ownerWindow(input);
      const unsubscribe = mergeCleanups(
        addEventListener(win, 'pointerup', onPointerUp, true),
        addEventListener(win, 'pointermove', onPointerMove, true),
      );
      return () => {
        exitPointerLockTimeout.clear();
        unsubscribe();
      };
    },
  );

  // A scrub stopped without its release: the lock, the scrubbing state and the scrubbed
  // value go, with no commit and no click. A later release finds no scrub to end.
  const cancelScrub = (disposing: boolean) => {
    if (!isScrubbingNow) {
      return;
    }
    isScrubbingNow = false;
    scrubSession += 1;
    didMove = false;
    pointerDownTarget = null;
    exitPointerLockTimeout.clear();
    exitPointerLock();
    if (!disposing) {
      setIsScrubbing(false);
    }
    ctx.setScrubbing(false);
    ctx.discardEdit();
  };

  // Disabled mid-scrub.
  createEffect(
    () => state.disabled,
    (disabled) => {
      if (disabled) {
        cancelScrub(false);
      }
      return undefined;
    },
  );

  // Unmounted mid-scrub.
  onCleanup(() => cancelScrub(true));

  // A one-finger scrub must not scroll the page; pinch-zoom still may.
  createEffect(
    () => [scrubAreaElement(), state.disabled] as const,
    ([element, disabled]) => {
      if (!element || disabled) {
        return undefined;
      }
      return addEventListener<TouchEvent>(
        element,
        'touchstart',
        (event) => {
          if (event.touches.length === 1) {
            event.preventDefault();
          }
        },
        { passive: false },
      );
    },
  );

  // The request belongs to the scrub that made it. A scrub ended or canceled before the
  // request runs makes none; one ended while the lock was pending releases what it gets.
  // A denied lock leaves the scrub going without it.
  const requestPointerLock = () => {
    const session = scrubSession;
    const current = () => session === scrubSession;
    Promise.resolve()
      .then(() => {
        if (current()) {
          return ownerDocument(untrack(scrubAreaElement)).body.requestPointerLock();
        }
        return undefined;
      })
      .then(
        () => {
          // A later scrub keeps the lock it shares with this one.
          if (!current() && !isScrubbingNow) {
            exitPointerLock();
          }
        },
        () => undefined,
      );
  };

  const defaultProps: HTMLProps = {
    role: 'presentation',
    style: SCRUB_AREA_STYLE,
    ref: (element: HTMLSpanElement) => setScrubAreaElement(element),
    onPointerDown(event: PointerEvent) {
      untrack(() => {
        if (event.defaultPrevented || event.button || state.disabled) {
          return;
        }
        const isTouch = event.pointerType === 'touch';
        isTouchInput = isTouch;
        if (event.pointerType === 'mouse') {
          event.preventDefault();
          ctx.focusInput();
        }
        isScrubbingNow = true;
        didMove = false;
        pointerDownTarget = getTarget(event);
        onScrubbingChange(true);
        // WebKit's pointer lock banner shifts the layout, so it scrubs without the lock.
        if (!isTouch && !platform.engine.webkit) {
          requestPointerLock();
        }
      });
    },
  };

  return useRenderElement('span', componentProps, {
    state,
    props: [defaultProps, elementProps],
    stateAttributesMapping,
  });
}
