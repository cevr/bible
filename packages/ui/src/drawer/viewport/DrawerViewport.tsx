// Upstream: packages/react/src/drawer/viewport/DrawerViewport.tsx
//
// The dialog's viewport, plus the drawer's swipe. A drag on the popup in the
// dismiss direction moves it with the pointer. Releasing past half the
// popup's size (at least 10px) or with a fast flick dismisses it; anything
// less springs it back, as does a dismissal the owner declines.
//
// On touch, a scrollable area inside the popup keeps its own scroll until it
// is scrolled to the edge the swipe leaves from; a cross-axis scroller (or an
// element marked `data-base-ui-swipe-ignore`) wins a gesture that moves
// along its axis first. A press inside `Drawer.Content` or on text being
// selected never starts a swipe.
import { isElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, flush, untrack } from 'solid-js';

import { renderDialogViewport } from '../../dialog/viewport/DialogViewport.tsx';
import type {
  DialogViewportProps,
  DialogViewportState,
} from '../../dialog/viewport/DialogViewport.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import {
  BASE_UI_SWIPE_IGNORE_ATTRIBUTE,
  BASE_UI_SWIPE_IGNORE_SELECTOR,
} from '../../internals/constants.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { TransitionStatusDataAttributes } from '../../internals/transitions.ts';
import { clamp } from '../../utils/clamp.ts';
import {
  activeElement,
  addEventListener,
  closest,
  contains,
  getTarget,
  ownerDocument,
} from '../../utils/dom.ts';
import { useAnimationFrame } from '../../utils/timers.ts';
import {
  findScrollableTouchTarget,
  getDisplacement,
  type ScrollAxis,
  type SwipeDirection,
  type UseSwipeDismissReleaseDetails,
  useSwipeDismiss,
} from '../../utils/useSwipeDismiss.ts';
import { useDrawerRootContext } from '../root/DrawerRootContext.ts';
import {
  DRAWER_CONTENT_ATTRIBUTE,
  DrawerPopupCssVars,
  DrawerPopupDataAttributes,
} from '../utils/drawerAttributes.ts';
import { DrawerViewportContext } from './DrawerViewportContext.ts';

const MIN_SWIPE_THRESHOLD = 10;
const FAST_SWIPE_VELOCITY = 0.5;
const MIN_SWIPE_RELEASE_VELOCITY = 0.2;
const MAX_SWIPE_RELEASE_VELOCITY = 4;
const MIN_SWIPE_RELEASE_DURATION_MS = 80;
const MAX_SWIPE_RELEASE_DURATION_MS = 360;
const MIN_SWIPE_RELEASE_SCALAR = 0.1;
const MAX_SWIPE_RELEASE_SCALAR = 1;
const AXIS_LOCK_SLOP = 6;
const AXIS_LOCK_BIAS = 2;
const DRAWER_CONTENT_SELECTOR = `[${DRAWER_CONTENT_ATTRIBUTE}]`;
const AXIS_SWIPE_IGNORE_SELECTORS: Record<ScrollAxis, string> = {
  horizontal: `[${BASE_UI_SWIPE_IGNORE_ATTRIBUTE}="x"]`,
  vertical: `[${BASE_UI_SWIPE_IGNORE_ATTRIBUTE}="y"]`,
};

interface TouchScrollState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  scrollTarget: HTMLElement | null;
  hasCrossAxisGestureTarget: boolean;
  allowSwipe: boolean | null;
  preserveNativeCrossAxisScroll: boolean;
  drawerAxisAttributed: boolean;
}

export interface DrawerViewportState extends DialogViewportState {}

export interface DrawerViewportProps extends DialogViewportProps {}

/**
 * A positioning container for the drawer popup that can be made scrollable.
 * Renders a `<div>` element.
 */
export function DrawerViewport(componentProps: DrawerViewportProps): JSX.Element {
  const { store } = useDialogRootContext();
  const drawer = useDrawerRootContext();

  const swipeDirection = drawer.swipeDirection;
  const scrollAxis = (): ScrollAxis =>
    swipeDirection() === 'left' || swipeDirection() === 'right' ? 'horizontal' : 'vertical';
  const crossScrollAxis = (): ScrollAxis =>
    scrollAxis() === 'vertical' ? 'horizontal' : 'vertical';

  const [swipeRelease, setSwipeRelease] = createSignal<number | null>(null, { ownedWrite: true });
  const controlledDismissFrame = useAnimationFrame();

  let lastPointerType = '';
  let ignoreNextTouchStartFromPen = false;
  let ignoreTouchSwipe = false;
  let touchScrollState: TouchScrollState | null = null;

  function setSwipeDismissed(dismissed: boolean) {
    untrack(store.popupElement)?.toggleAttribute(DrawerPopupDataAttributes.swipeDismiss, dismissed);
  }

  function clearSwipeRelease() {
    setSwipeDismissed(false);
    untrack(store.popupElement)?.removeAttribute(TransitionStatusDataAttributes.endingStyle);
    setSwipeRelease(null);
  }

  /** How hard the release was, as a scalar of the exit transition's duration (0.1-1). */
  function resolveSwipeRelease(
    popup: HTMLElement,
    direction: SwipeDirection,
    details: UseSwipeDismissReleaseDetails,
  ): number | null {
    const size = getBaseSwipeSize(popup, direction);
    if (size <= 0) {
      return null;
    }
    const translation = getDisplacement(direction, details.deltaX, details.deltaY);
    const remainingDistance = Math.max(0, size - translation);
    if (remainingDistance <= 0) {
      return null;
    }
    const releaseVelocity = getDisplacement(
      direction,
      details.releaseVelocityX,
      details.releaseVelocityY,
    );
    const directionalVelocity =
      Math.abs(releaseVelocity) > 0
        ? releaseVelocity
        : getDisplacement(direction, details.velocityX, details.velocityY);
    if (directionalVelocity <= MIN_SWIPE_RELEASE_VELOCITY) {
      return null;
    }
    const clampedVelocity = clamp(
      directionalVelocity,
      MIN_SWIPE_RELEASE_VELOCITY,
      MAX_SWIPE_RELEASE_VELOCITY,
    );
    const durationMs = clamp(
      remainingDistance / clampedVelocity,
      MIN_SWIPE_RELEASE_DURATION_MS,
      MAX_SWIPE_RELEASE_DURATION_MS,
    );
    const normalizedDuration =
      (durationMs - MIN_SWIPE_RELEASE_DURATION_MS) /
      (MAX_SWIPE_RELEASE_DURATION_MS - MIN_SWIPE_RELEASE_DURATION_MS);
    return (
      MIN_SWIPE_RELEASE_SCALAR +
      normalizedDuration * (MAX_SWIPE_RELEASE_SCALAR - MIN_SWIPE_RELEASE_SCALAR)
    );
  }

  const swipe = useSwipeDismiss({
    get enabled() {
      return store.mounted();
    },
    get directions() {
      return [swipeDirection()];
    },
    element: store.popupElement,
    ignoreSelectorWhenTouch: false,
    ignoreScrollableAncestors: true,
    movementCssVars: { x: DrawerPopupCssVars.swipeMovementX, y: DrawerPopupCssVars.swipeMovementY },
    onSwipeStart(event) {
      if ('touches' in event || event.pointerType === 'touch') {
        return;
      }
      // A mouse drag that began a text selection inside the popup drops it.
      const popup = untrack(store.popupElement);
      const selection = ownerDocument(popup).getSelection?.();
      if (!selection || selection.isCollapsed) {
        return;
      }
      if (
        !contains(popup, nodeElement(selection.anchorNode)) &&
        !contains(popup, nodeElement(selection.focusNode))
      ) {
        return;
      }
      selection.removeAllRanges();
    },
    swipeThreshold: ({ element, direction }) => getBaseSwipeThreshold(element, direction),
    canStart(position, details) {
      const popup = untrack(store.popupElement);
      if (!popup) {
        return false;
      }
      const elementAtPoint = getElementAtPoint(popup.getRootNode(), position.x, position.y);
      if (!elementAtPoint || !contains(popup, elementAtPoint)) {
        return false;
      }
      const nativeEvent = details.nativeEvent;
      const touchLike = 'touches' in nativeEvent || nativeEvent.pointerType === 'touch';
      if (touchLike && shouldIgnoreSwipeForTextSelection(popup.ownerDocument, popup)) {
        return false;
      }
      // Over a cross-axis gesture target, wait until the drawer's axis wins the gesture.
      const touchState = touchScrollState;
      if (
        touchLike &&
        touchState?.hasCrossAxisGestureTarget &&
        !touchState.drawerAxisAttributed &&
        touchState.allowSwipe !== true
      ) {
        return false;
      }
      return true;
    },
    onRelease(details) {
      const popup = untrack(store.popupElement);
      const direction = details.direction;
      if (!popup || !direction) {
        clearSwipeRelease();
        return undefined;
      }
      const directionalDelta = getDisplacement(direction, details.deltaX, details.deltaY);
      if (directionalDelta <= 0) {
        clearSwipeRelease();
        return false;
      }
      const shouldClose =
        getDisplacement(direction, details.velocityX, details.velocityY) >= FAST_SWIPE_VELOCITY ||
        directionalDelta > getBaseSwipeThreshold(popup, direction);
      if (!shouldClose) {
        clearSwipeRelease();
        return false;
      }
      // The exit styles start at once, so the popup never looks stuck on release.
      setSwipeDismissed(true);
      popup.style.removeProperty('transition');
      popup.setAttribute(TransitionStatusDataAttributes.endingStyle, '');
      setSwipeRelease(resolveSwipeRelease(popup, direction, details));
      return true;
    },
    onDismiss(event) {
      const dismissDetails = createChangeEventDetails(REASONS.swipe, event);
      store.setOpen(false, dismissDetails);
      // Applied now, so `open` below tells an accepted close from a controlled owner's refusal.
      flush();
      if (dismissDetails.isCanceled) {
        untrack(swipe.reset);
        clearSwipeRelease();
        return;
      }

      // A controlled drawer may keep `open` until its owner updates it; a frame
      // later, still open means the owner declined, so the drawer springs back.
      if (untrack(store.open)) {
        controlledDismissFrame.request(() => {
          if (untrack(store.open)) {
            clearSwipeRelease();
            untrack(swipe.reset);
          }
        });
        return;
      }

      setSwipeDismissed(true);
    },
  });

  // Touch moves are claimed in document capture: the swipe and the popup's
  // scrollers arbitrate there before anything below sees the move.
  createEffect(
    () =>
      [
        store.viewportElement() ?? store.popupElement(),
        store.open(),
        store.mounted(),
        scrollAxis(),
        swipeDirection(),
      ] as const,
    ([rootElement, open, mounted, axis, direction]) => {
      if (!rootElement) {
        return undefined;
      }
      const doc = ownerDocument(rootElement);
      const isVerticalAxis = axis === 'vertical';

      const processTouchMove = (event: TouchEvent, touchState: TouchScrollState, touch: Touch) => {
        const drawerAxisDelta = isVerticalAxis
          ? touch.clientY - touchState.lastY
          : touch.clientX - touchState.lastX;
        // Pinch zoom and text selection handles stay native.
        if (event.touches.length === 2) {
          return;
        }
        if (shouldIgnoreSwipeForTextSelection(doc, rootElement) || !open || !mounted) {
          return;
        }
        if (shouldYieldTouchMove(touchState, event, touch, isVerticalAxis)) {
          return;
        }

        const scrollTarget = touchState.scrollTarget;
        if (!scrollTarget || scrollTarget === doc.documentElement || scrollTarget === doc.body) {
          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopPropagation();
          swipe.moveNative(event, rootElement);
          return;
        }

        if (!hasScrollableContentOnAxis(scrollTarget, axis)) {
          // A scroller that does not overflow on the drawer's axis keeps the page still.
          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopPropagation();
          return;
        }

        if (drawerAxisDelta !== 0) {
          const canSwipeFromEdge = canSwipeFromScrollEdgeOnMove(
            scrollTarget,
            axis,
            direction,
            drawerAxisDelta,
          );
          if (!touchState.allowSwipe) {
            if (event.cancelable && canSwipeFromEdge) {
              touchState.allowSwipe = true;
              event.preventDefault();
            } else {
              touchState.allowSwipe = false;
            }
          } else if (event.cancelable) {
            event.preventDefault();
          }
        }

        if (touchState.allowSwipe === true) {
          event.stopPropagation();
          swipe.moveNative(event, rootElement);
        }
      };

      return addEventListener<TouchEvent>(
        doc,
        'touchmove',
        (event) => {
          if (ignoreTouchSwipe) {
            return;
          }
          const touchState = touchScrollState;
          const touch = event.touches[0];
          if (!touch || !touchState) {
            return;
          }
          processTouchMove(event, touchState, touch);
          touchState.lastX = touch.clientX;
          touchState.lastY = touch.clientY;
        },
        { passive: false, capture: true },
      );
    },
  );

  createEffect(
    () => store.open(),
    (open) => {
      if (!open) {
        return;
      }
      untrack(swipe.reset);
      clearSwipeRelease();
    },
  );

  function resetTouchSwipeState(ignoreSwipe: boolean) {
    ignoreTouchSwipe = ignoreSwipe;
    touchScrollState = null;
  }

  function resetTouchTrackingState() {
    resetTouchSwipeState(false);
    lastPointerType = '';
    ignoreNextTouchStartFromPen = false;
  }

  const handlePointerEnd = (event: PointerEvent) => {
    lastPointerType = '';
    return event.pointerType !== 'touch';
  };

  const canSwipeNow = () => untrack(store.open) && untrack(store.mounted);

  const swipeProps = {
    onPointerDown(event: PointerEvent) {
      lastPointerType = event.pointerType;
      ignoreNextTouchStartFromPen = event.pointerType === 'pen';
      if (!canSwipeNow()) {
        return;
      }
      const currentTarget = event.currentTarget as HTMLElement;
      const elementAtPoint = getElementAtPoint(
        currentTarget.getRootNode(),
        event.clientX,
        event.clientY,
      );
      // A pointer drag captures the pointer on press, so any swipe-ignore value ignores it.
      if (
        closest(elementAtPoint, BASE_UI_SWIPE_IGNORE_SELECTOR) ||
        closest(elementAtPoint, DRAWER_CONTENT_SELECTOR)
      ) {
        return;
      }
      if (event.pointerType === 'touch') {
        return;
      }
      swipe.getPointerProps().onPointerDown?.(event);
    },
    onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        return;
      }
      swipe.getPointerProps().onPointerMove?.(event);
    },
    onPointerUp(event: PointerEvent) {
      if (handlePointerEnd(event)) {
        swipe.getPointerProps().onPointerUp?.(event);
      }
    },
    onPointerCancel(event: PointerEvent) {
      if (handlePointerEnd(event)) {
        swipe.getPointerProps().onPointerCancel?.(event);
      }
    },
    onTouchStart(event: TouchEvent) {
      if (lastPointerType === 'pen' && ignoreNextTouchStartFromPen) {
        ignoreNextTouchStartFromPen = false;
        resetTouchSwipeState(false);
        return;
      }
      if (!canSwipeNow()) {
        resetTouchSwipeState(false);
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      if (event.composedPath().some(isRangeInput)) {
        resetTouchSwipeState(false);
        return;
      }
      const rootElement = event.currentTarget as HTMLElement;
      const elementAtPoint = getElementAtPoint(
        rootElement.getRootNode(),
        touch.clientX,
        touch.clientY,
      );
      const eventTarget = getTarget(event);
      const target = isElement(eventTarget) ? eventTarget : rootElement;
      if (!contains(rootElement, target)) {
        resetTouchSwipeState(true);
        return;
      }
      const axis = untrack(scrollAxis);
      const crossAxis = untrack(crossScrollAxis);
      // `x`/`y` hand drags along that axis to the element; any other value ignores the
      // swipe outright, and a cross-axis element is arbitrated like a cross-axis scroller.
      if (
        closest(
          elementAtPoint,
          `${BASE_UI_SWIPE_IGNORE_SELECTOR}:not(${AXIS_SWIPE_IGNORE_SELECTORS[crossAxis]})`,
        )
      ) {
        resetTouchSwipeState(true);
        return;
      }
      ignoreTouchSwipe = false;

      const scrollTarget = findScrollableTouchTarget(target, rootElement, axis);
      const hasCrossAxisGestureTarget =
        findScrollableTouchTarget(target, rootElement, crossAxis) != null ||
        closest(elementAtPoint, AXIS_SWIPE_IGNORE_SELECTORS[crossAxis]) != null;
      let allowSwipe: boolean | null = null;
      if (scrollTarget) {
        allowSwipe = isAtSwipeStartEdge(scrollTarget, axis, untrack(swipeDirection)) ? null : false;
      }
      touchScrollState = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        scrollTarget,
        hasCrossAxisGestureTarget,
        allowSwipe,
        preserveNativeCrossAxisScroll: false,
        drawerAxisAttributed: false,
      };
      swipe.getTouchProps().onTouchStart?.(event);
    },
    onTouchEnd(event: TouchEvent) {
      resetTouchTrackingState();
      swipe.getTouchProps().onTouchEnd?.(event);
    },
    onTouchCancel(event: TouchEvent) {
      resetTouchTrackingState();
      swipe.getTouchProps().onTouchCancel?.(event);
    },
  };

  const context: DrawerViewportContext = {
    swiping: swipe.swiping,
    getDragStyles: swipe.getDragStyles,
    swipeStrength: swipeRelease,
  };

  // As upstream's, the drawer's viewport leaves out the dialog's `data-nested-dialog-open`.
  return (
    <DrawerViewportContext value={context}>
      {untrack(() =>
        renderDialogViewport(componentProps, swipeProps, { suppressNestedDialogOpen: true }),
      )}
    </DrawerViewportContext>
  );
}

type ElementFromPointRoot = Node & Partial<Pick<Document, 'elementFromPoint'>>;

// `elementFromPoint` retargets shadow content to its host, so the callers pass `getRootNode()`.
function getElementAtPoint(root: ElementFromPointRoot | null | undefined, x: number, y: number) {
  return typeof root?.elementFromPoint === 'function' ? root.elementFromPoint(x, y) : null;
}

function nodeElement(node: Node | null | undefined): Element | null {
  if (!node) {
    return null;
  }
  return isElement(node) ? node : node.parentElement;
}

function isRangeInput(target: EventTarget): boolean {
  return (
    isElement(target) && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range'
  );
}

function getBaseSwipeSize(element: HTMLElement, direction: SwipeDirection): number {
  return direction === 'left' || direction === 'right' ? element.offsetWidth : element.offsetHeight;
}

function getBaseSwipeThreshold(element: HTMLElement, direction: SwipeDirection): number {
  return Math.max(getBaseSwipeSize(element, direction) * 0.5, MIN_SWIPE_THRESHOLD);
}

function isTextSelectionControl(target: Element): target is HTMLInputElement | HTMLTextAreaElement {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

function shouldIgnoreSwipeForTextSelection(doc: Document, rootElement: HTMLElement): boolean {
  const active = activeElement(doc);
  if (active && contains(rootElement, active) && isTextSelectionControl(active)) {
    const { selectionStart, selectionEnd } = active;
    if (selectionStart != null && selectionEnd != null && selectionStart < selectionEnd) {
      return true;
    }
  }
  const selection = doc.getSelection?.();
  if (!selection || selection.isCollapsed) {
    return false;
  }
  return (
    selection.containsNode(rootElement, true) ||
    contains(rootElement, nodeElement(selection.anchorNode)) ||
    contains(rootElement, nodeElement(selection.focusNode))
  );
}

/**
 * Arbitrates a touchmove between the drawer's swipe and a cross-axis gesture
 * (a native scroll, or an element marked with the cross-axis swipe-ignore
 * value). `true` leaves the move alone: the cross axis won, or neither axis
 * has passed the slop yet.
 */
function shouldYieldTouchMove(
  touchState: TouchScrollState,
  event: TouchEvent,
  touch: Touch,
  isVerticalAxis: boolean,
): boolean {
  if (touchState.preserveNativeCrossAxisScroll) {
    return true;
  }
  // Attribution happens once per gesture.
  if (
    touchState.drawerAxisAttributed ||
    touchState.allowSwipe === true ||
    !touchState.hasCrossAxisGestureTarget
  ) {
    return false;
  }
  // A non-cancelable move is a native scroll the browser has committed to.
  if (!event.cancelable) {
    touchState.preserveNativeCrossAxisScroll = true;
    return true;
  }
  const drawerAxisDelta = Math.abs(
    isVerticalAxis ? touch.clientY - touchState.startY : touch.clientX - touchState.startX,
  );
  const crossAxisDelta = Math.abs(
    isVerticalAxis ? touch.clientX - touchState.startX : touch.clientY - touchState.startY,
  );
  if (crossAxisDelta >= AXIS_LOCK_SLOP && crossAxisDelta > drawerAxisDelta + AXIS_LOCK_BIAS) {
    touchState.preserveNativeCrossAxisScroll = true;
    return true;
  }
  if (drawerAxisDelta >= AXIS_LOCK_SLOP) {
    touchState.drawerAxisAttributed = true;
    return false;
  }
  // Unattributed: on iOS a `preventDefault()` now would lock a later cross-axis scroll.
  return true;
}

function getScrollMetrics(scrollTarget: HTMLElement, axis: ScrollAxis) {
  if (axis === 'vertical') {
    return {
      offset: scrollTarget.scrollTop,
      max: Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight),
    };
  }
  return {
    offset: scrollTarget.scrollLeft,
    max: Math.max(0, scrollTarget.scrollWidth - scrollTarget.clientWidth),
  };
}

function hasScrollableContentOnAxis(scrollTarget: HTMLElement, axis: ScrollAxis): boolean {
  return getScrollMetrics(scrollTarget, axis).max > 0;
}

function shouldDismissFromStartEdge(direction: SwipeDirection, axis: ScrollAxis): boolean {
  return axis === 'vertical' ? direction === 'down' : direction === 'right';
}

function isAtSwipeStartEdge(
  scrollTarget: HTMLElement,
  axis: ScrollAxis,
  direction: SwipeDirection,
): boolean {
  const { offset, max } = getScrollMetrics(scrollTarget, axis);
  return shouldDismissFromStartEdge(direction, axis) ? offset <= 0 : offset >= max;
}

function canSwipeFromScrollEdgeOnMove(
  scrollTarget: HTMLElement,
  axis: ScrollAxis,
  direction: SwipeDirection,
  delta: number,
): boolean {
  const movingTowardDismiss = shouldDismissFromStartEdge(direction, axis) ? delta > 0 : delta < 0;
  return movingTowardDismiss && isAtSwipeStartEdge(scrollTarget, axis, direction);
}
