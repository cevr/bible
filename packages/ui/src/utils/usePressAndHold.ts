// Upstream: packages/react/src/internals/usePressAndHold.ts
//
// Press-and-hold for a stepper button: a press acts once at once, then after
// `startDelay` repeats every `tickDelay` until the pointer is released, leaves
// the button, or a tick returns `false`. A mouse press acts on pointerdown
// (the click that follows is skipped); a touch or pen press waits briefly to
// tell a hold from a scroll, and a plain tap acts through the click instead.
import { createEffect, onCleanup, untrack } from 'solid-js';

import { addEventListener, NOOP, ownerWindow } from './dom.ts';
import { useInterval, useTimeout } from './timers.ts';

const DEFAULT_TICK_DELAY = 60;
const DEFAULT_START_DELAY = 400;
const DEFAULT_SCROLL_DISTANCE = 8;
const TOUCH_TIMEOUT = 50;
const MAX_POINTER_MOVES_AFTER_TOUCH = 3;

/** Whether a pointer acts like touch (a pen too: it should not raise the software keyboard). */
export function isTouchLikePointerType(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

export interface UsePressAndHoldParameters {
  /** While `true`, presses do nothing and a running hold stops. */
  readonly disabled: boolean;
  /** One step of the hold; returning `false` stops the repeats. */
  tick: (triggerEvent?: Event) => boolean;
  /** Called on every release (the window's `pointerup`) after a hold started. */
  onStop?: ((event: PointerEvent) => void) | undefined;
  /** Milliseconds between repeats. @default 60 */
  readonly tickDelay?: number | undefined;
  /** Milliseconds before the repeats start. @default 400 */
  readonly startDelay?: number | undefined;
  /** How far (px) a touch may move before the press counts as a scroll. @default 8 */
  readonly scrollDistance?: number | undefined;
  /** The element whose window receives the release listener. */
  element: () => HTMLElement | null;
}

export interface PressAndHoldHandlers {
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onMouseEnter: (event: MouseEvent) => void;
  onMouseLeave: () => void;
  onMouseUp: () => void;
}

export interface UsePressAndHoldReturnValue {
  pointerHandlers: PressAndHoldHandlers;
  /**
   * Whether the button's click should do nothing: a mouse press already acted
   * on pointerdown, and the click a touch hold leaves behind is not a tap.
   */
  shouldSkipClick: (event: MouseEvent) => boolean;
}

export function usePressAndHold(params: UsePressAndHoldParameters): UsePressAndHoldReturnValue {
  const startTickTimeout = useTimeout();
  const tickInterval = useInterval();
  const intentionalTouchCheckTimeout = useTimeout();

  const disabled = () => untrack(() => params.disabled);
  let isPressed = false;
  let movesAfterTouch = 0;
  let downCoords = { x: 0, y: 0 };
  let isTouchingButton = false;
  let ignoreClick = false;
  let pointerType = '';
  let unsubscribeContextMenu: () => void = NOOP;
  let unsubscribePointerUp: () => void = NOOP;

  const stopAutoChange = () => {
    intentionalTouchCheckTimeout.clear();
    startTickTimeout.clear();
    tickInterval.clear();
    unsubscribeContextMenu();
    unsubscribeContextMenu = NOOP;
    movesAfterTouch = 0;
  };

  const startAutoChange = (triggerEvent?: Event) => {
    stopAutoChange();
    const element = params.element();
    if (!element) {
      return;
    }
    const win = ownerWindow(element);
    // A touch that drifts just outside the button would otherwise open the context menu.
    unsubscribeContextMenu = addEventListener(win, 'contextmenu', (event) => {
      event.preventDefault();
    });
    // The release listener outlives `stopAutoChange`, so a hold that stopped
    // at a bound still reports its release; one listener at a time, so a
    // leave/enter cycle during the hold does not report twice.
    unsubscribePointerUp();
    unsubscribePointerUp = addEventListener<PointerEvent>(
      win,
      'pointerup',
      (event) => {
        isPressed = false;
        stopAutoChange();
        unsubscribePointerUp = NOOP;
        params.onStop?.(event);
      },
      { once: true },
    );

    if (!params.tick(triggerEvent)) {
      stopAutoChange();
      return;
    }
    const startDelay = untrack(() => params.startDelay) ?? DEFAULT_START_DELAY;
    const tickDelay = untrack(() => params.tickDelay) ?? DEFAULT_TICK_DELAY;
    startTickTimeout.start(startDelay, () => {
      tickInterval.start(tickDelay, () => {
        if (!params.tick(triggerEvent)) {
          stopAutoChange();
        }
      });
    });
  };

  onCleanup(() => {
    stopAutoChange();
    unsubscribePointerUp();
  });

  createEffect(
    () => params.disabled,
    (isDisabled) => {
      if (isDisabled) {
        isPressed = false;
        isTouchingButton = false;
        pointerType = '';
        stopAutoChange();
      }
    },
  );

  const pointerHandlers: PressAndHoldHandlers = {
    onTouchStart() {
      isTouchingButton = true;
    },
    onTouchEnd() {
      isTouchingButton = false;
    },
    onPointerDown(event) {
      if (event.defaultPrevented || event.button || disabled()) {
        return;
      }
      pointerType = event.pointerType;
      ignoreClick = false;
      isPressed = true;
      downCoords = { x: event.clientX, y: event.clientY };

      if (!isTouchLikePointerType(event.pointerType)) {
        event.preventDefault();
        startAutoChange(event);
        return;
      }
      // A touch may be the start of a scroll or a pinch: wait to see.
      intentionalTouchCheckTimeout.start(TOUCH_TIMEOUT, () => {
        const moves = movesAfterTouch;
        movesAfterTouch = 0;
        if (isPressed && moves < MAX_POINTER_MOVES_AFTER_TOUCH) {
          startAutoChange(event);
          // The click the browser fires after the hold is not a tap.
          ignoreClick = true;
        } else {
          // A tap or a scroll: the click performs the single step.
          ignoreClick = false;
          stopAutoChange();
        }
      });
    },
    onPointerUp(event) {
      // A quick tap releases before the touch check; the check must not start a hold then.
      if (isTouchLikePointerType(event.pointerType)) {
        isPressed = false;
      }
    },
    onPointerMove(event) {
      if (disabled() || !isTouchLikePointerType(event.pointerType) || !isPressed) {
        return;
      }
      movesAfterTouch += 1;
      const dx = downCoords.x - event.clientX;
      const dy = downCoords.y - event.clientY;
      const scrollDistance = untrack(() => params.scrollDistance) ?? DEFAULT_SCROLL_DISTANCE;
      if (dx ** 2 + dy ** 2 > scrollDistance ** 2) {
        stopAutoChange();
      }
    },
    onMouseEnter(event) {
      if (
        event.defaultPrevented ||
        disabled() ||
        !isPressed ||
        isTouchingButton ||
        isTouchLikePointerType(pointerType)
      ) {
        return;
      }
      startAutoChange(event);
    },
    onMouseLeave() {
      if (!isTouchingButton) {
        stopAutoChange();
      }
    },
    // The button's own release, for when an ancestor stops `pointerup` reaching the window.
    onMouseUp() {
      if (!isTouchingButton) {
        stopAutoChange();
      }
    },
  };

  const shouldSkipClick = (event: MouseEvent): boolean => {
    if (event.defaultPrevented) {
      return true;
    }
    if (isTouchLikePointerType(pointerType)) {
      return ignoreClick;
    }
    return event.detail !== 0;
  };

  return { pointerHandlers, shouldSkipClick };
}
