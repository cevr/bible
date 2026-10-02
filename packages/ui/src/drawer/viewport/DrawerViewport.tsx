// Upstream: packages/react/src/drawer/viewport/DrawerViewport.tsx
//
// The dialog's viewport, plus the drawer's swipe. A drag on the popup in the
// dismiss direction moves it with the pointer. Without snap points, releasing
// past half the popup's size (at least 10px) or with a fast flick dismisses
// it; anything less springs it back. With snap points (on a vertical drawer)
// the release settles on the snap point nearest to where the drag and its
// velocity would carry it, or dismisses when closing is nearer.
//
// On touch, a scrollable area inside the popup keeps its own scroll until it
// is scrolled to the edge the swipe leaves from; a cross-axis scroller (or an
// element marked `data-base-ui-swipe-ignore`) wins a gesture that moves
// along its axis first. A press inside `Drawer.Content` or on text being
// selected never starts a swipe.
//
// While swiping, the backdrop carries `--drawer-swipe-progress` and a parent
// drawer hears of the swipe, so it can follow.
import { isElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, flush, onCleanup, untrack } from 'solid-js';

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
  type UseSwipeDismissProgressDetails,
  type UseSwipeDismissReleaseDetails,
  useSwipeDismiss,
} from '../../utils/useSwipeDismiss.ts';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext.ts';
import { useDrawerRootContext } from '../root/DrawerRootContext.ts';
import {
  closestSnapPointIndex,
  type DrawerSnapPoint,
  getSnapPointSwipeMovement,
  type ResolvedDrawerSnapPoint,
} from '../root/snapPoints.ts';
import {
  DRAWER_CONTENT_ATTRIBUTE,
  DrawerBackdropCssVars,
  DrawerPopupCssVars,
  DrawerPopupDataAttributes,
} from '../utils/drawerAttributes.ts';
import { DrawerViewportContext } from './DrawerViewportContext.ts';

const MIN_SWIPE_THRESHOLD = 10;
const FAST_SWIPE_VELOCITY = 0.5;
const SNAP_VELOCITY_THRESHOLD = 0.5;
const SNAP_VELOCITY_MULTIPLIER = 300;
const MAX_SNAP_VELOCITY = 4;
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
  const provider = useDrawerProviderContext();

  const nestedDrawerOpen = () => store.nestedOpenDrawerCount() > 0;
  const swipeDirection = drawer.swipeDirection;
  const scrollAxis = (): ScrollAxis =>
    swipeDirection() === 'left' || swipeDirection() === 'right' ? 'horizontal' : 'vertical';
  const crossScrollAxis = (): ScrollAxis =>
    scrollAxis() === 'vertical' ? 'horizontal' : 'vertical';
  const hasSnapPoints = () => (drawer.snapPoints()?.length ?? 0) > 0;
  const isVerticalDrawer = () => swipeDirection() === 'down' || swipeDirection() === 'up';

  const [swipeRelease, setSwipeRelease] = createSignal<number | null>(null, { ownedWrite: true });
  const controlledDismissFrame = useAnimationFrame();

  let pendingSwipeCloseSnapPoint: DrawerSnapPoint | null | undefined;
  let swipingNow = false;
  let nestedSwipeActive = false;
  let lastPointerType = '';
  let ignoreNextTouchStartFromPen = false;
  let ignoreTouchSwipe = false;
  let touchScrollState: TouchScrollState | null = null;

  // The offsets of the two lowest snap points span the backdrop's progress.
  const snapPointRange = createMemo(() => {
    const resolved = drawer.resolvedSnapPoints();
    if ((drawer.snapPoints()?.length ?? 0) < 2 || resolved.length < 2 || !isVerticalDrawer()) {
      return null;
    }
    const offsets = resolved.map((point) => point.offset).sort((a, b) => a - b);
    const minOffset = offsets[0] ?? 0;
    return { minOffset, range: (offsets[1] ?? minOffset) - minOffset };
  });

  const snapPointProgress = createMemo(() => {
    const range = snapPointRange();
    const offset = drawer.activeSnapPointOffset();
    if (!range || offset === null) {
      return null;
    }
    return clamp((offset - range.minOffset) / range.range, 0, 1);
  });

  // With snap points, a vertical drawer drags both ways: up to a taller point.
  const swipeDirections = createMemo((): SwipeDirection[] => {
    const direction = swipeDirection();
    if (hasSnapPoints() && isVerticalDrawer()) {
      return direction === 'down' ? ['down', 'up'] : ['up', 'down'];
    }
    return [direction];
  });

  function setSwipeDismissed(dismissed: boolean) {
    untrack(store.popupElement)?.toggleAttribute(DrawerPopupDataAttributes.swipeDismiss, dismissed);
    store.backdropRef.current?.toggleAttribute(DrawerPopupDataAttributes.swipeDismiss, dismissed);
  }

  function clearSwipeRelease() {
    setSwipeDismissed(false);
    untrack(store.popupElement)?.removeAttribute(TransitionStatusDataAttributes.endingStyle);
    setSwipeRelease(null);
  }

  function finishNestedSwipe() {
    if (!nestedSwipeActive) {
      return;
    }
    nestedSwipeActive = false;
    drawer.notifyParentSwipingChange?.(false);
  }

  function applySwipeProgress(
    resolvedProgress: number,
    shouldTrackProgress: boolean,
    notifyParent: boolean,
  ) {
    const open = untrack(store.open);
    const isActive = open && !store.nested && shouldTrackProgress;
    const swipeProgress = isActive ? resolvedProgress : 0;
    const nestedSwipeProgress = open && shouldTrackProgress ? resolvedProgress : 0;
    const frontmostHeight = untrack(drawer.frontmostHeight);

    if (notifyParent && drawer.notifyParentSwipeProgressChange) {
      drawer.notifyParentSwipeProgressChange(nestedSwipeProgress);
      if (nestedSwipeProgress <= 0) {
        finishNestedSwipe();
      }
    }

    provider?.setVisualState({
      swipeProgress,
      frontmostHeight: swipeProgress > 0 ? frontmostHeight : 0,
    });

    const backdrop = store.backdropRef.current;
    if (!backdrop) {
      return;
    }
    const showProgress = isActive && swipeProgress > 0;
    backdrop.style.setProperty(
      DrawerBackdropCssVars.swipeProgress,
      showProgress ? `${swipeProgress}` : '0',
    );
    if (showProgress && frontmostHeight > 0) {
      backdrop.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight}px`);
    } else {
      backdrop.style.removeProperty(DrawerPopupCssVars.height);
    }
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
    // A snap point's offset already moves the popup along the dismiss direction.
    const snapPointBaseOffset =
      (direction === 'down' || direction === 'up') && untrack(hasSnapPoints)
        ? (untrack(drawer.activeSnapPointOffset) ?? 0)
        : 0;
    const translation =
      snapPointBaseOffset + getDisplacement(direction, details.deltaX, details.deltaY);
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

  function updateNestedSwipeActive(details: UseSwipeDismissProgressDetails | undefined) {
    if (nestedSwipeActive || !details) {
      return;
    }
    const direction = details.direction ?? untrack(swipeDirection);
    const delta = getDisplacement(direction, details.deltaX, details.deltaY);
    if (Math.abs(delta) < MIN_SWIPE_THRESHOLD) {
      return;
    }
    nestedSwipeActive = true;
    drawer.notifyParentSwipingChange?.(true);
  }

  /** Decides a release with snap points: settle on one (`false`) or dismiss (`true`). */
  function releaseOnSnapPoints(
    details: UseSwipeDismissReleaseDetails,
    startSwipeRelease: (direction: SwipeDirection) => void,
  ): boolean | undefined {
    const direction = untrack(swipeDirection);
    const popupHeight = untrack(drawer.popupHeight);
    const resolvedSnapPoints = untrack(drawer.resolvedSnapPoints);
    if (direction !== 'down' && direction !== 'up') {
      clearSwipeRelease();
      return undefined;
    }
    if (!popupHeight) {
      clearSwipeRelease();
      return false;
    }
    if (resolvedSnapPoints.length === 0) {
      clearSwipeRelease();
      return undefined;
    }

    const { deltaY, velocityY, releaseVelocityY } = details;
    const dragDelta = direction === 'down' ? deltaY : -deltaY;
    const dragDirection = Math.sign(dragDelta);
    let directionalVelocity = direction === 'down' ? releaseVelocityY : -releaseVelocityY;
    if (dragDirection !== 0 && Math.abs(dragDelta) >= MIN_SWIPE_THRESHOLD) {
      const velocityDirection = Math.sign(directionalVelocity);
      if (velocityDirection !== 0 && velocityDirection !== dragDirection) {
        // A touch reversal at the end does not flip the decision.
        directionalVelocity = direction === 'down' ? velocityY : -velocityY;
      }
    }

    const currentOffset = untrack(drawer.activeSnapPointOffset) ?? 0;
    const dragTargetOffset = clamp(currentOffset + dragDelta, 0, popupHeight);
    const velocityOffset =
      Math.abs(directionalVelocity) >= SNAP_VELOCITY_THRESHOLD
        ? clamp(directionalVelocity, -MAX_SNAP_VELOCITY, MAX_SNAP_VELOCITY) *
          SNAP_VELOCITY_MULTIPLIER
        : 0;
    const sequential = untrack(drawer.snapToSequentialPoints);
    const targetOffset = sequential
      ? dragTargetOffset
      : clamp(dragTargetOffset + velocityOffset, 0, popupHeight);
    const snapPointEventDetails = createChangeEventDetails(REASONS.swipe, details.event);

    const settleInPlace = () => {
      // The hook's trailing progress update may be deduped, so the nested state resets here.
      applySwipeProgress(0, true, true);
      clearSwipeRelease();
      return false;
    };
    const settleOnSnapPoint = (snapPoint: ResolvedDrawerSnapPoint) => {
      drawer.setActiveSnapPoint(snapPoint.value, snapPointEventDetails);
      return settleInPlace();
    };
    const closeFromSnapPoints = (fallback: ResolvedDrawerSnapPoint) => {
      // A gesture with no direction (a mostly sideways flick) may settle, never dismiss.
      if (!details.direction) {
        return settleOnSnapPoint(fallback);
      }
      drawer.setActiveSnapPoint(null, snapPointEventDetails);
      if (snapPointEventDetails.isCanceled) {
        return settleInPlace();
      }
      pendingSwipeCloseSnapPoint = untrack(drawer.activeSnapPoint);
      startSwipeRelease(direction);
      return true;
    };

    if (sequential) {
      const ordered = [...resolvedSnapPoints].sort((a, b) => a.offset - b.offset);
      const orderedOffsets = ordered.map((point) => point.offset);
      const currentIndex = closestSnapPointIndex(orderedOffsets, currentOffset);
      let target = ordered[closestSnapPointIndex(orderedOffsets, targetOffset)];
      if (!target) {
        return settleInPlace();
      }
      const velocityDirection = Math.sign(directionalVelocity);
      const shouldAdvance =
        dragDirection !== 0 &&
        velocityDirection === dragDirection &&
        Math.abs(directionalVelocity) >= SNAP_VELOCITY_THRESHOLD;
      let effectiveTargetOffset = targetOffset;
      if (shouldAdvance) {
        const adjacentIndex = clamp(currentIndex + dragDirection, 0, ordered.length - 1);
        const adjacent = ordered[adjacentIndex];
        if (adjacentIndex !== currentIndex && adjacent) {
          const forceAdjacent =
            dragDirection > 0 ? targetOffset < adjacent.offset : targetOffset > adjacent.offset;
          if (forceAdjacent) {
            target = adjacent;
            effectiveTargetOffset = adjacent.offset;
          }
        } else if (dragDirection > 0) {
          return closeFromSnapPoints(target);
        }
      }
      const closeDistance = Math.abs(effectiveTargetOffset - popupHeight);
      if (closeDistance < Math.abs(effectiveTargetOffset - target.offset)) {
        return closeFromSnapPoints(target);
      }
      return settleOnSnapPoint(target);
    }

    const closest =
      resolvedSnapPoints[
        closestSnapPointIndex(
          resolvedSnapPoints.map((point) => point.offset),
          targetOffset,
        )
      ];
    if (!closest) {
      return settleInPlace();
    }
    if (directionalVelocity >= FAST_SWIPE_VELOCITY && dragDelta > 0) {
      return closeFromSnapPoints(closest);
    }
    if (Math.abs(targetOffset - popupHeight) < Math.abs(targetOffset - closest.offset)) {
      return closeFromSnapPoints(closest);
    }
    return settleOnSnapPoint(closest);
  }

  const swipe = useSwipeDismiss({
    get enabled() {
      return store.mounted() && !nestedDrawerOpen();
    },
    get directions() {
      return swipeDirections();
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
    onSwipingChange(swiping) {
      swipingNow = swiping;
      store.backdropRef.current?.toggleAttribute(DrawerPopupDataAttributes.swiping, swiping);
      if (!swiping && !drawer.notifyParentSwipeProgressChange) {
        finishNestedSwipe();
      }
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
    onProgress(progress, details) {
      const swiping = swipingNow;
      if (swiping) {
        updateNestedSwipeActive(details);
      }

      const direction = untrack(swipeDirection);
      const snapOffset = untrack(drawer.activeSnapPointOffset);
      if (swiping && direction === 'down' && untrack(hasSnapPoints) && details) {
        const popup = untrack(store.popupElement);
        if (popup) {
          popup.style.removeProperty('transform');
          popup.style.setProperty(
            DrawerPopupCssVars.swipeMovementY,
            `${getSnapPointSwipeMovement(snapOffset ?? 0, details.deltaY)}px`,
          );
        }
      }

      let resolvedProgress = progress;
      const range = untrack(snapPointRange);
      const popupHeight = untrack(drawer.popupHeight);
      if (range && popupHeight > 0) {
        const baseOffset = snapOffset ?? range.minOffset;
        // Outside a drag the hook still reports the last deltas; those are not re-applied
        // to a drawer resting on its snap point.
        if (swiping && details && Number.isFinite(details.deltaY)) {
          resolvedProgress = clamp(
            (clamp(baseOffset + details.deltaY, 0, popupHeight) - range.minOffset) / range.range,
            0,
            1,
          );
        } else {
          const restingProgress = untrack(snapPointProgress);
          if (restingProgress !== null) {
            resolvedProgress = restingProgress;
          }
        }
      }

      // A parent drawer follows an active drag only.
      if (!swiping) {
        drawer.notifyParentSwipeProgressChange?.(0);
        finishNestedSwipe();
      }
      applySwipeProgress(resolvedProgress, true, swiping);
    },
    onRelease(details) {
      const popup = untrack(store.popupElement);
      if (!popup) {
        clearSwipeRelease();
        return undefined;
      }

      const startSwipeRelease = (direction: SwipeDirection) => {
        // The exit styles start at once, so the popup never looks stuck on release.
        finishNestedSwipe();
        setSwipeDismissed(true);
        popup.style.removeProperty('transition');
        popup.setAttribute(TransitionStatusDataAttributes.endingStyle, '');
        setSwipeRelease(resolveSwipeRelease(popup, direction, details));
      };

      if (!untrack(hasSnapPoints)) {
        const direction = details.direction;
        if (!direction) {
          clearSwipeRelease();
          return undefined;
        }
        const directionalDelta = getDisplacement(direction, details.deltaX, details.deltaY);
        if (directionalDelta <= 0) {
          clearSwipeRelease();
          return false;
        }
        if (
          getDisplacement(direction, details.velocityX, details.velocityY) >= FAST_SWIPE_VELOCITY
        ) {
          startSwipeRelease(direction);
          return true;
        }
        const shouldClose = directionalDelta > getBaseSwipeThreshold(popup, direction);
        if (shouldClose) {
          startSwipeRelease(direction);
        } else {
          clearSwipeRelease();
        }
        return shouldClose;
      }

      return releaseOnSnapPoints(details, startSwipeRelease);
    },
    onDismiss(event) {
      provider?.setVisualState({ swipeProgress: 0, frontmostHeight: 0 });
      const backdrop = store.backdropRef.current;
      if (backdrop) {
        backdrop.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
        backdrop.style.removeProperty(DrawerPopupCssVars.height);
      }

      const restorePendingSnapPoint = () => {
        if (pendingSwipeCloseSnapPoint !== undefined) {
          drawer.setActiveSnapPoint(
            pendingSwipeCloseSnapPoint,
            createChangeEventDetails(REASONS.swipe, event),
          );
        }
        pendingSwipeCloseSnapPoint = undefined;
      };

      const dismissDetails = createChangeEventDetails(REASONS.swipe, event);
      store.setOpen(false, dismissDetails);
      // Applied now, so `open` below tells an accepted close from a controlled owner's refusal.
      flush();
      if (dismissDetails.isCanceled) {
        restorePendingSnapPoint();
        untrack(swipe.reset);
        clearSwipeRelease();
        return;
      }

      // A controlled drawer may keep `open` until its owner updates it; a frame
      // later, still open means the owner declined, so the drawer springs back.
      if (untrack(store.open)) {
        controlledDismissFrame.request(() => {
          if (untrack(store.open)) {
            restorePendingSnapPoint();
            clearSwipeRelease();
            untrack(swipe.reset);
          } else {
            pendingSwipeCloseSnapPoint = undefined;
          }
        });
        return;
      }

      pendingSwipeCloseSnapPoint = undefined;
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
        nestedDrawerOpen(),
        scrollAxis(),
        swipeDirection(),
      ] as const,
    ([rootElement, open, mounted, nestedOpen, axis, direction]) => {
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
        if (
          shouldIgnoreSwipeForTextSelection(doc, rootElement) ||
          !open ||
          !mounted ||
          nestedOpen
        ) {
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

  // A drawer resting on a snap point shows that point's progress on the backdrop.
  createEffect(
    () =>
      [
        snapPointRange(),
        swipe.swiping(),
        store.open(),
        snapPointProgress(),
        drawer.frontmostHeight(),
      ] as const,
    ([range, swiping, open, progress]) => {
      if (!range || swiping) {
        return;
      }
      applySwipeProgress(!open || store.nested ? 0 : (progress ?? 0), true, false);
    },
  );

  if (drawer.notifyParentSwipeProgressChange) {
    const notify = drawer.notifyParentSwipeProgressChange;
    createEffect(
      () => store.open(),
      (open) => {
        if (!open) {
          notify(0);
        }
        return () => {
          notify(0);
        };
      },
    );
  }

  createEffect(
    () => store.open(),
    (open) => {
      if (!open) {
        return;
      }
      // A swipe area driving the open writes the movement variables itself; a reset
      // here would flash the popup fully open for a frame.
      if (!drawer.swipeAreaActiveRef.current) {
        untrack(swipe.reset);
      }
      clearSwipeRelease();
    },
  );

  onCleanup(() => {
    provider?.setVisualState({ swipeProgress: 0, frontmostHeight: 0 });
    store.backdropRef.current?.toggleAttribute(DrawerPopupDataAttributes.swiping, false);
    finishNestedSwipe();
  });

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

  const canSwipeNow = () =>
    untrack(store.open) && untrack(store.mounted) && !untrack(nestedDrawerOpen);

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

  // The drawer's popup carries its own nested-drawer attributes, so the viewport
  // leaves out the dialog's `data-nested-dialog-open`.
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
