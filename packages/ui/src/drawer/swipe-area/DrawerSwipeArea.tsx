// Upstream: packages/react/src/drawer/swipe-area/DrawerSwipeArea.tsx
//
// An invisible strip (usually along a screen edge) that opens the drawer
// with a swipe. The drawer opens as soon as the drag starts and follows the
// pointer in, with the backdrop fading in to match; releasing past half the
// popup's size, or with any flick toward open, keeps it open, anything less
// closes it again. The swipe opens away from the edge the drawer dismisses
// toward, unless `swipeDirection` says otherwise.
//
// The release's trailing click would land outside the popup, so outside
// presses stay off until the next press of the user's own.
import type { JSX } from '@solidjs/web';
import {
  createEffect,
  createSignal,
  createUniqueId,
  flush,
  omit,
  onCleanup,
  untrack,
} from 'solid-js';

import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import { isVirtualClick } from '../../floating-ui-solid/utils/event.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { addEventListener, NOOP, ownerDocument } from '../../utils/dom.ts';
import {
  getDisplacement,
  getElementTransform,
  type SwipeDirection,
  useSwipeDismiss,
} from '../../utils/useSwipeDismiss.ts';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext.ts';
import { type DrawerSwipeDirection, useDrawerRootContext } from '../root/DrawerRootContext.ts';
import {
  DrawerBackdropCssVars,
  DrawerPopupCssVars,
  DrawerPopupDataAttributes,
  DrawerSwipeAreaDataAttributes,
} from '../utils/drawerAttributes.ts';

const DEFAULT_SWIPE_OPEN_RATIO = 0.5;
const MIN_SWIPE_START_DISTANCE = 1;
const VELOCITY_THRESHOLD = 0.1;
const FALLBACK_SWIPE_OPEN_THRESHOLD = 40;

const OPEN_HOOK = { [DrawerSwipeAreaDataAttributes.open]: '' };
const CLOSED_HOOK = { [DrawerSwipeAreaDataAttributes.closed]: '' };
const SWIPING_HOOK = { [DrawerSwipeAreaDataAttributes.swiping]: '' };
const DISABLED_HOOK = { [DrawerSwipeAreaDataAttributes.disabled]: '' };

export interface DrawerSwipeAreaState {
  /** Whether the drawer is open. */
  open: boolean;
  /** Whether the swipe area is being swiped. */
  swiping: boolean;
  /** The swipe direction that opens the drawer. */
  swipeDirection: SwipeDirection;
  disabled: boolean;
}

export interface DrawerSwipeAreaProps extends BaseUIComponentProps<'div', DrawerSwipeAreaState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** The swipe direction that opens the drawer; the opposite of the root's `swipeDirection` by default. */
  swipeDirection?: DrawerSwipeDirection | undefined;
}

const stateAttributesMapping: StateAttributesMapping<DrawerSwipeAreaState> = {
  open: (value) => (value ? OPEN_HOOK : CLOSED_HOOK),
  swiping: (value) => (value ? SWIPING_HOOK : null),
  swipeDirection: (value) => ({ [DrawerSwipeAreaDataAttributes.swipeDirection]: value }),
  disabled: (value) => (value ? DISABLED_HOOK : null),
};

const oppositeSwipeDirection: Record<DrawerSwipeDirection, DrawerSwipeDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const isHorizontal = (direction: DrawerSwipeDirection) =>
  direction === 'left' || direction === 'right';

/**
 * An invisible area that listens for swipe gestures to open the drawer.
 * Renders a `<div>` element.
 */
export function DrawerSwipeArea(componentProps: DrawerSwipeAreaProps): JSX.Element {
  const { store } = useDialogRootContext();
  const drawer = useDrawerRootContext();
  const provider = useDrawerProviderContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'disabled',
    'swipeDirection',
    'id',
  );

  const swipeAreaId = untrack(() => componentProps.id) || createUniqueId();
  const [swipeActive, setSwipeActive] = createSignal(false, { ownedWrite: true });
  const [swipeAreaElement, setSwipeAreaElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  let swipeStartEvent: PointerEvent | TouchEvent | null = null;
  let openedBySwipe = false;
  const dragDelta = { x: 0, y: 0 };
  let closedOffset: number | null = null;
  let appliedSwipeStyles = false;
  let swipePopupElement: HTMLElement | null = null;
  let swipeBackdropElement: HTMLElement | null = null;
  let popupTransition: string | null = null;
  let releaseGuardCleanup: () => void = NOOP;

  const disabled = () => componentProps.disabled ?? false;
  const openDirection = (): DrawerSwipeDirection =>
    componentProps.swipeDirection ?? oppositeSwipeDirection[drawer.swipeDirection()];
  const dismissDirection = () => oppositeSwipeDirection[openDirection()];
  const enabled = () => !disabled() && (!store.open() || swipeActive());

  onCleanup(() => store.registerTrigger(swipeAreaId, null));

  function resetDragDelta() {
    dragDelta.x = 0;
    dragDelta.y = 0;
  }

  function disableDismissForSwipe() {
    releaseGuardCleanup();
    store.outsidePressEnabledRef.current = false;
  }

  /**
   * Outside presses come back on the next press that is not the gesture's
   * own trailing click: a `pointerdown`, or a click with no pointer behind it
   * (keyboard, assistive tech). Listening in capture runs this ahead of the
   * outside-press check, so that press still dismisses.
   */
  function enableDismissAfterRelease() {
    releaseGuardCleanup();
    const doc = ownerDocument(untrack(swipeAreaElement));
    let removePointerDown = NOOP;
    let removeClick = NOOP;
    const restore = (event?: Event) => {
      if (
        event instanceof MouseEvent &&
        event.type === 'click' &&
        event.detail !== 0 &&
        !isVirtualClick(event)
      ) {
        return;
      }
      releaseGuardCleanup = NOOP;
      removePointerDown();
      removeClick();
      store.outsidePressEnabledRef.current = true;
    };
    removePointerDown = addEventListener(doc, 'pointerdown', restore, true);
    removeClick = addEventListener(doc, 'click', restore, true);
    releaseGuardCleanup = () => restore();
  }

  function popupSize(popup: HTMLElement): number | null {
    const size = isHorizontal(untrack(dismissDirection)) ? popup.offsetWidth : popup.offsetHeight;
    return size > 0 ? size : null;
  }

  function resolveClosedOffset(popup: HTMLElement): number | null {
    const offset = popupSize(popup);
    if (offset == null) {
      return null;
    }
    const transform = getElementTransform(popup);
    const transformOffset = isHorizontal(untrack(dismissDirection)) ? transform.x : transform.y;
    if (Number.isFinite(transformOffset) && Math.abs(transformOffset) > 0.5) {
      return Math.min(offset, Math.abs(transformOffset));
    }
    return offset;
  }

  function resolveSwipeOpenThreshold(): number {
    const popup = untrack(store.popupElement);
    const size = popup ? popupSize(popup) : null;
    return size == null ? FALLBACK_SWIPE_OPEN_THRESHOLD : size * DEFAULT_SWIPE_OPEN_RATIO;
  }

  /** Moves the popup in with the drag and fades the backdrop in to match. */
  function applySwipeMovement() {
    const popup = untrack(store.popupElement);
    if (!popup || !untrack(store.open) || !untrack(store.mounted)) {
      return;
    }
    if (closedOffset == null) {
      closedOffset = resolveClosedOffset(popup);
    }
    if (closedOffset === null) {
      return;
    }

    const direction = untrack(openDirection);
    const dismiss = untrack(dismissDirection);
    const displacement = Math.max(0, getDisplacement(direction, dragDelta.x, dragDelta.y));
    // Past fully open, the popup resists with the square root of the overshoot.
    const dampedDisplacement =
      displacement > closedOffset
        ? closedOffset + Math.sqrt(displacement - closedOffset)
        : displacement;
    const movement =
      (closedOffset - dampedDisplacement) * (dismiss === 'left' || dismiss === 'up' ? -1 : 1);
    const movementX = isHorizontal(dismiss) ? movement : 0;
    const movementY = isHorizontal(dismiss) ? 0 : movement;
    const openProgress = Math.max(0, Math.min(1, displacement / closedOffset));
    const backdropProgress = 1 - openProgress;
    const frontmostHeight = untrack(drawer.frontmostHeight);

    popup.style.setProperty(DrawerPopupCssVars.swipeMovementX, `${movementX}px`);
    popup.style.setProperty(DrawerPopupCssVars.swipeMovementY, `${movementY}px`);
    popup.setAttribute(DrawerPopupDataAttributes.swiping, '');
    swipePopupElement = popup;
    if (popupTransition === null) {
      popupTransition = popup.style.transition;
    }
    popup.style.transition = 'none';

    const backdrop = store.backdropRef.current;
    if (backdrop) {
      backdrop.setAttribute(DrawerPopupDataAttributes.swiping, '');
      swipeBackdropElement = backdrop;
      backdrop.style.setProperty(DrawerBackdropCssVars.swipeProgress, `${backdropProgress}`);
      if (openProgress > 0 && frontmostHeight > 0) {
        backdrop.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight}px`);
      } else {
        backdrop.style.removeProperty(DrawerPopupCssVars.height);
      }
    }

    provider?.setVisualState({
      swipeProgress: openProgress,
      frontmostHeight: openProgress > 0 ? frontmostHeight : 0,
    });
    appliedSwipeStyles = true;
    drawer.swipeAreaActiveRef.current = true;
  }

  function clearSwipeStyles() {
    const popup = swipePopupElement;
    if (popup) {
      popup.style.removeProperty(DrawerPopupCssVars.swipeMovementX);
      popup.style.removeProperty(DrawerPopupCssVars.swipeMovementY);
      popup.removeAttribute(DrawerPopupDataAttributes.swiping);
      if (popupTransition !== null) {
        popup.style.transition = popupTransition;
      }
    }
    popupTransition = null;
    const backdrop = swipeBackdropElement;
    if (backdrop) {
      backdrop.removeAttribute(DrawerPopupDataAttributes.swiping);
      backdrop.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      backdrop.style.removeProperty(DrawerPopupCssVars.height);
    }
    provider?.setVisualState({ swipeProgress: 0, frontmostHeight: 0 });
    appliedSwipeStyles = false;
    swipePopupElement = null;
    swipeBackdropElement = null;
    drawer.swipeAreaActiveRef.current = false;
  }

  function changeOpen(open: boolean, event: PointerEvent | TouchEvent | undefined) {
    store.setOpen(
      open,
      createChangeEventDetails(REASONS.swipe, event, untrack(swipeAreaElement) ?? undefined),
    );
    // The change reaches the DOM now: the popup the drag moves must be mounted,
    // and the release reads whether the drawer opened.
    flush();
  }

  function resetSwipeInteractionState() {
    swipeStartEvent = null;
    openedBySwipe = false;
    closedOffset = null;
    setSwipeActive(false);
  }

  function finishSwipeInteraction() {
    resetSwipeInteractionState();
    enableDismissAfterRelease();
    resetDragDelta();
    clearSwipeStyles();
  }

  const swipe = useSwipeDismiss({
    get enabled() {
      return enabled();
    },
    get directions() {
      return [openDirection()];
    },
    element: swipeAreaElement,
    trackDrag: false,
    movementCssVars: { x: DrawerPopupCssVars.swipeMovementX, y: DrawerPopupCssVars.swipeMovementY },
    onSwipeStart(event) {
      disableDismissForSwipe();
      swipeStartEvent = event;
      openedBySwipe = false;
      setSwipeActive(true);
      resetDragDelta();
    },
    onProgress(_progress, details) {
      if (!details || !swipeStartEvent) {
        return;
      }
      dragDelta.x = details.deltaX;
      dragDelta.y = details.deltaY;
      const direction = untrack(openDirection);
      if (details.direction !== direction) {
        return;
      }
      const displacement = getDisplacement(direction, details.deltaX, details.deltaY);
      if (!openedBySwipe && displacement < MIN_SWIPE_START_DISTANCE) {
        return;
      }
      if (!openedBySwipe && !untrack(store.open)) {
        openedBySwipe = true;
        changeOpen(true, swipeStartEvent);
      }
      applySwipeMovement();
    },
    onRelease({ event, direction, deltaX, deltaY, releaseVelocityX, releaseVelocityY }) {
      const openTo = untrack(openDirection);
      const displacement = getDisplacement(openTo, deltaX, deltaY);
      const releaseVelocity = getDisplacement(openTo, releaseVelocityX, releaseVelocityY);
      const shouldOpen =
        direction === openTo &&
        (displacement >= resolveSwipeOpenThreshold() || releaseVelocity >= VELOCITY_THRESHOLD) &&
        !untrack(disabled);
      if (shouldOpen) {
        if (!untrack(store.open)) {
          openedBySwipe = true;
          changeOpen(true, event);
        }
      } else if (openedBySwipe && untrack(store.open)) {
        changeOpen(false, event);
      }
      finishSwipeInteraction();
      return false;
    },
    onCancel: finishSwipeInteraction,
  });

  // Opening mounts the popup with its movement variables at rest; the drag's
  // position goes back on as soon as the popup is there.
  createEffect(
    () => [store.popupElement(), store.mounted()] as const,
    () => {
      if (untrack(swipeActive) && appliedSwipeStyles) {
        applySwipeMovement();
      }
    },
  );

  createEffect(enabled, (isEnabled) => {
    if (isEnabled) {
      return;
    }
    if (untrack(swipeActive)) {
      enableDismissAfterRelease();
    }
    untrack(swipe.reset);
    resetDragDelta();
    clearSwipeStyles();
    resetSwipeInteractionState();
  });

  onCleanup(() => {
    releaseGuardCleanup();
    store.outsidePressEnabledRef.current = true;
  });

  const state: DrawerSwipeAreaState = {
    get open() {
      return store.open();
    },
    get swiping() {
      return swipe.swiping();
    },
    get swipeDirection() {
      return openDirection();
    },
    get disabled() {
      return disabled();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    stateAttributesMapping,
    ref: (el: HTMLElement) => {
      setSwipeAreaElement(el);
      store.registerTrigger(swipeAreaId, el);
    },
    props: [
      {
        id: swipeAreaId,
        role: 'presentation',
        'aria-hidden': 'true',
        get style() {
          return {
            'pointer-events': enabled() ? undefined : 'none',
            'touch-action': isHorizontal(openDirection()) ? 'pan-y' : 'pan-x',
          };
        },
        onPointerDown(event: PointerEvent) {
          if (event.pointerType === 'touch') {
            return;
          }
          swipe.getPointerProps().onPointerDown?.(event);
          // Native text selection and drag would compete with the swipe.
          if (event.cancelable) {
            event.preventDefault();
          }
        },
        onPointerMove(event: PointerEvent) {
          if (event.pointerType !== 'touch') {
            swipe.getPointerProps().onPointerMove?.(event);
          }
        },
        onPointerUp(event: PointerEvent) {
          if (event.pointerType !== 'touch') {
            swipe.getPointerProps().onPointerUp?.(event);
          }
        },
        onPointerCancel(event: PointerEvent) {
          if (event.pointerType !== 'touch') {
            swipe.getPointerProps().onPointerCancel?.(event);
          }
        },
        onTouchStart(event: TouchEvent) {
          swipe.getTouchProps().onTouchStart?.(event);
        },
        onTouchMove(event: TouchEvent) {
          swipe.getTouchProps().onTouchMove?.(event);
        },
        onTouchEnd(event: TouchEvent) {
          swipe.getTouchProps().onTouchEnd?.(event);
        },
        onTouchCancel(event: TouchEvent) {
          swipe.getTouchProps().onTouchCancel?.(event);
        },
      },
      elementProps,
    ],
  });
}
