// Upstream: packages/react/src/utils/useSwipeDismiss.ts,
// packages/react/src/utils/getElementTransform.ts,
// packages/react/src/utils/scrollable.ts,
// packages/react/src/utils/getElementAtPoint.ts
//
// Swipe to dismiss for an element: a pointer or touch drag in one of the
// allowed directions moves the element with the pointer (damped against the
// allowed directions), and releasing past the threshold dismisses it;
// reversing course cancels. Mouse gestures that start on interactive
// elements, and touches inside a scrollable area (until it is scrolled to the
// edge the swipe leaves from), are left to them. While swiping, the element's transform and
// the movement CSS variables are written imperatively so the element tracks
// the pointer without a render per move. Release reports the swipe's
// velocity so a consumer may decide dismissal by flick.
//
// The pure helpers (displacement, damping, transform parsing) are exported
// for the parts that run their own swipe logic.
import {
  getComputedStyle as getElementComputedStyle,
  getParentNode,
  isHTMLElement,
  isLastTraversableNode,
} from '@floating-ui/utils/dom';
import { type Accessor, createSignal } from 'solid-js';

import { closest, contains, getTarget, ownerDocument, ownerWindow } from './dom.ts';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export type ScrollAxis = 'horizontal' | 'vertical';

type SwipeDismissEvent = PointerEvent | TouchEvent;

const DEFAULT_SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const MIN_VELOCITY_DURATION_MS = 50;
const MIN_RELEASE_VELOCITY_DURATION_MS = 16;
const MAX_RELEASE_VELOCITY_AGE_MS = 80;
const MIN_VELOCITY_SAMPLE_DISTANCE = 1;
const DEFAULT_IGNORE_SELECTOR = 'button,a,input,select,textarea,label,[role="button"]';

/** How far a drag of (`deltaX`, `deltaY`) travels in `direction`. */
export function getDisplacement(direction: SwipeDirection, deltaX: number, deltaY: number) {
  switch (direction) {
    case 'up':
      return -deltaY;
    case 'down':
      return deltaY;
    case 'left':
      return -deltaX;
    case 'right':
      return deltaX;
    default:
      return 0;
  }
}

/**
 * The 2D translation and scale of a computed `transform` value (`matrix(…)`
 * or `matrix3d(…)`); identity for `none` or anything unparsable.
 */
export function parseTransform(transform: string | null | undefined) {
  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  if (transform && transform !== 'none') {
    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (matrix?.[1]) {
      const values = matrix[1].split(', ').map(parseFloat);
      if (values.length === 6) {
        translateX = values[4] ?? 0;
        translateY = values[5] ?? 0;
        scale = Math.sqrt((values[0] ?? 1) ** 2 + (values[1] ?? 0) ** 2);
      } else if (values.length === 16) {
        translateX = values[12] ?? 0;
        translateY = values[13] ?? 0;
        scale = values[0] ?? 1;
      }
    }
  }

  return { x: translateX, y: translateY, scale };
}

/**
 * The 2D translation and scale of the element's computed `transform`. The
 * `translate`, `rotate` and `scale` longhands are separate properties and
 * are not reflected in it.
 */
export function getElementTransform(element: HTMLElement, computedStyle?: CSSStyleDeclaration) {
  return parseTransform(
    (computedStyle ?? ownerWindow(element).getComputedStyle(element)).transform,
  );
}

/**
 * Damps movement against the allowed directions: on an allowed axis, travel
 * the wrong way grows with the square root of the distance; on an axis with
 * no allowed direction, all travel does.
 */
export function applyDirectionalDamping(
  deltaX: number,
  deltaY: number,
  directions: ReadonlyArray<SwipeDirection>,
) {
  const allowLeft = directions.includes('left');
  const allowRight = directions.includes('right');
  const allowUp = directions.includes('up');
  const allowDown = directions.includes('down');
  const exponent = (value: number) => Math.sign(value) * Math.abs(value) ** 0.5;
  const dampAxis = (delta: number, allowNegative: boolean, allowPositive: boolean) => {
    if ((!allowNegative && delta < 0) || (!allowPositive && delta > 0)) {
      return exponent(delta);
    }
    return delta;
  };

  const x = allowLeft || allowRight ? dampAxis(deltaX, allowLeft, allowRight) : exponent(deltaX);
  const y = allowUp || allowDown ? dampAxis(deltaY, allowUp, allowDown) : exponent(deltaY);

  return { x, y };
}

function isScrollable(element: HTMLElement, axis: ScrollAxis): boolean {
  const style = getElementComputedStyle(element);
  const overflow = axis === 'vertical' ? style.overflowY : style.overflowX;
  if (overflow !== 'auto' && overflow !== 'scroll') {
    return false;
  }
  return axis === 'vertical'
    ? element.scrollHeight > element.clientHeight
    : element.scrollWidth > element.clientWidth;
}

/** Whether an element from `target` up to (not including) `root` scrolls on `axis`. */
function hasScrollableAncestor(target: HTMLElement, root: HTMLElement, axis: ScrollAxis): boolean {
  // `getParentNode` crosses shadow boundaries (and slots).
  let node: Node | null = target;
  while (isHTMLElement(node) && node !== root && !isLastTraversableNode(node)) {
    if (isScrollable(node, axis)) {
      return true;
    }
    node = getParentNode(node);
  }
  return false;
}

/** The nearest element from `target` up to `root` (inclusive) that scrolls on `axis`. */
export function findScrollableTouchTarget(
  target: EventTarget | null,
  root: HTMLElement,
  axis: ScrollAxis = 'vertical',
): HTMLElement | null {
  let node: Node | null = isHTMLElement(target) ? target : null;
  while (isHTMLElement(node) && node !== root && !isLastTraversableNode(node)) {
    if (isScrollable(node, axis)) {
      return node;
    }
    node = getParentNode(node);
  }

  return isScrollable(root, axis) ? root : null;
}

type ElementFromPointRoot = Node & Partial<Pick<Document, 'elementFromPoint'>>;

/**
 * The element at a point. `Document.elementFromPoint` retargets shadow
 * content to the shadow host, so callers pass `getRootNode()` (a document or
 * a shadow root).
 */
export function getElementAtPoint(
  root: ElementFromPointRoot | null | undefined,
  x: number,
  y: number,
) {
  return typeof root?.elementFromPoint === 'function' ? root.elementFromPoint(x, y) : null;
}

function getValidTimeStamp(timeStamp: number): number | null {
  return Number.isFinite(timeStamp) && timeStamp > 0 ? timeStamp : null;
}

function getDragTransform(dragOffset: { x: number; y: number }, scale: number): string {
  return `translate3d(${dragOffset.x}px,${dragOffset.y}px,0) scale(${scale})`;
}

function hasPrimaryMouseButton(buttons: number): boolean {
  return buttons % 2 === 1;
}

function isTouchEvent(event: SwipeDismissEvent): event is TouchEvent {
  return 'touches' in event;
}

function safelyChangePointerCapture(
  element: HTMLElement,
  pointerId: number,
  method: 'setPointerCapture' | 'releasePointerCapture',
) {
  const pointerCaptureMethod = element[method];
  if (typeof pointerCaptureMethod !== 'function') {
    return;
  }

  try {
    pointerCaptureMethod.call(element, pointerId);
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError') {
      return;
    }
    throw error;
  }
}

interface UseSwipeDismissDetails {
  nativeEvent: PointerEvent | TouchEvent;
  direction: SwipeDirection | undefined;
}

interface UseSwipeDismissReleaseDetails {
  event: PointerEvent | TouchEvent;
  direction: SwipeDirection | undefined;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
  releaseVelocityX: number;
  releaseVelocityY: number;
}

/** Options are read live: pass getters for values that change. */
interface UseSwipeDismissOptions {
  enabled: boolean;
  directions: SwipeDirection[];
  /** The element that is swiped. */
  element: Accessor<HTMLElement | null | undefined>;
  movementCssVars: { x: string; y: string };
  /**
   * The minimum distance (in pixels) the pointer must travel from the initial swipe point
   * before the gesture is considered a dismiss. 40 without an element.
   */
  swipeThreshold?:
    | ((details: { element: HTMLElement; direction: SwipeDirection }) => number)
    | undefined;
  /**
   * If provided, swiping only begins once this returns true.
   * It is evaluated on start and on later move events while the pointer is down.
   */
  canStart?:
    | ((position: { x: number; y: number }, details: UseSwipeDismissDetails) => boolean)
    | undefined;
  onSwipeStart?: ((event: PointerEvent | TouchEvent) => void) | undefined;
  /**
   * Called when the swipe interaction ends. Returning `true` or `false`
   * overrides the default dismissal decision.
   */
  onRelease?: ((details: UseSwipeDismissReleaseDetails) => boolean | void) | undefined;
  onDismiss?:
    | ((event: PointerEvent | TouchEvent, details: { direction: SwipeDirection }) => void)
    | undefined;
}

interface UseSwipeDismissReturnValue {
  swiping: Accessor<boolean>;
  getPointerProps: () => {
    onPointerDown?: (event: PointerEvent) => void;
    onPointerMove?: (event: PointerEvent) => void;
    onPointerUp?: (event: PointerEvent) => void;
    onPointerCancel?: (event: PointerEvent) => void;
  };
  getTouchProps: () => {
    onTouchStart?: (event: TouchEvent) => void;
    onTouchEnd?: (event: TouchEvent) => void;
    onTouchCancel?: (event: TouchEvent) => void;
  };
  /**
   * Feeds a native touchmove into the swipe: the consumer claims touch moves
   * in a capture-phase listener; `currentTarget` bounds the scroll check.
   */
  moveNative: (nativeEvent: TouchEvent, currentTarget: HTMLElement) => void;
  /** The element's drag styles for its `style` (read it in a tracking scope). */
  getDragStyles: () => Record<string, string | undefined>;
  reset: () => void;
}

export function useSwipeDismiss(options: UseSwipeDismissOptions): UseSwipeDismissReturnValue {
  const directions = () => options.directions;
  const primaryDirection = () => (directions().length === 1 ? directions()[0] : undefined);
  const allow = (direction: SwipeDirection) => directions().includes(direction);
  const hasHorizontal = () => allow('left') || allow('right');
  const hasVertical = () => allow('up') || allow('down');
  // Consumers only pass directions on a single axis.
  const scrollAxis = (): ScrollAxis => (hasHorizontal() ? 'horizontal' : 'vertical');

  const [isSwiping, setIsSwiping] = createSignal(false, { ownedWrite: true });
  const [dragDismissed, setDragDismissed] = createSignal(false, { ownedWrite: true });

  let dragStartPos = { x: 0, y: 0 };
  let dragOffset = { x: 0, y: 0 };
  let lastMovePos: { x: number; y: number } | null = null;
  let initialTransform = { x: 0, y: 0, scale: 1 };
  let intendedSwipeDirection: SwipeDirection | undefined;
  let maxSwipeDisplacement = 0;
  let cancelledSwipe = false;
  let swipeCancelBaseline = { x: 0, y: 0 };
  let isFirstPointerMove = false;
  let pendingSwipe = false;
  let pendingSwipeStartPos: { x: number; y: number } | null = null;
  let swipeFromScrollable = false;
  let sawPrimaryButtonsOnMove = false;
  let swipeThreshold = DEFAULT_SWIPE_THRESHOLD;
  let swipeThresholdFunction:
    | ((details: { element: HTMLElement; direction: SwipeDirection }) => number)
    | null = null;
  let swipeStartTime: number | null = null;
  let lastDragSample: { x: number; y: number; time: number } | null = null;
  let hasStationarySample = false;
  let lastDragVelocity = { x: 0, y: 0 };
  let swipingNow = false;
  let dragStyleSnapshot: [string, string] | null = null;

  function setSwiping(nextSwiping: boolean) {
    if (swipingNow === nextSwiping) {
      return;
    }

    swipingNow = nextSwiping;
    setIsSwiping(nextSwiping);
  }

  function resolveSwipeThreshold(direction: SwipeDirection | undefined) {
    if (!direction) {
      return;
    }

    const element = options.element();
    if (!element || !swipeThresholdFunction) {
      return;
    }

    swipeThreshold = Math.max(0, swipeThresholdFunction({ element, direction }));
  }

  function syncDragStyles(swiping: boolean) {
    const element = options.element();
    if (!element) {
      if (!swiping) {
        dragStyleSnapshot = null;
      }
      return;
    }

    const style = element.style;
    if (swiping) {
      if (!dragStyleSnapshot) {
        dragStyleSnapshot = [style.transition, style.transform];
      }
      style.transition = 'none';
    } else if (dragStyleSnapshot) {
      [style.transition, style.transform] = dragStyleSnapshot;
      dragStyleSnapshot = null;
    }

    const deltaX = dragOffset.x - initialTransform.x;
    const deltaY = dragOffset.y - initialTransform.y;

    if (swiping) {
      style.transform = getDragTransform(dragOffset, initialTransform.scale);
    }

    style.setProperty(options.movementCssVars.x, `${deltaX}px`);
    style.setProperty(options.movementCssVars.y, `${deltaY}px`);
  }

  function recordDragSample(offset: { x: number; y: number }, timeStamp: number | null) {
    if (timeStamp === null) {
      return;
    }

    const lastSample = lastDragSample;
    if (lastSample && timeStamp > lastSample.time) {
      // Some Android devices emit one effectively stationary move immediately before release.
      // Keep the last moving sample and its timestamp. Repeated stationary moves still clear
      // the velocity, and a release after a hold still expires the last moving sample.
      const stationary =
        Math.abs(offset.x - lastSample.x) < MIN_VELOCITY_SAMPLE_DISTANCE &&
        Math.abs(offset.y - lastSample.y) < MIN_VELOCITY_SAMPLE_DISTANCE;
      const skipSample = stationary && !hasStationarySample;
      hasStationarySample = stationary;
      if (skipSample) {
        return;
      }

      const durationMs = Math.max(timeStamp - lastSample.time, MIN_RELEASE_VELOCITY_DURATION_MS);
      lastDragVelocity = {
        x: (offset.x - lastSample.x) / durationMs,
        y: (offset.y - lastSample.y) / durationMs,
      };
    }

    lastDragSample = { x: offset.x, y: offset.y, time: timeStamp };
  }

  function reset() {
    setSwiping(false);
    setDragDismissed(false);

    swipeThreshold = DEFAULT_SWIPE_THRESHOLD;
    swipeThresholdFunction = null;
    dragStartPos = { x: 0, y: 0 };
    dragOffset = { x: 0, y: 0 };
    initialTransform = { x: 0, y: 0, scale: 1 };
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;
    cancelledSwipe = false;
    swipeCancelBaseline = { x: 0, y: 0 };
    isFirstPointerMove = false;
    lastMovePos = null;
    pendingSwipe = false;
    pendingSwipeStartPos = null;
    swipeFromScrollable = false;
    sawPrimaryButtonsOnMove = false;
    swipeStartTime = null;
    lastDragSample = null;
    hasStationarySample = false;
    lastDragVelocity = { x: 0, y: 0 };
    syncDragStyles(false);
  }

  function getPrimaryPointerPosition(event: SwipeDismissEvent) {
    if (isTouchEvent(event)) {
      const touch = event.touches[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    return { x: event.clientX, y: event.clientY };
  }

  function isTouchLikeEvent(event: SwipeDismissEvent) {
    if (isTouchEvent(event)) {
      return true;
    }
    return event.pointerType === 'touch';
  }

  function getTargetAtPoint(position: { x: number; y: number }, nativeEvent: Event) {
    const root = options.element()?.getRootNode();
    const elementAtPoint = getElementAtPoint(root, position.x, position.y);
    const target = elementAtPoint ?? getTarget(nativeEvent);
    return target as HTMLElement | null;
  }

  function findGestureScrollableTouchTarget(
    target: EventTarget | null,
    root: HTMLElement,
  ): HTMLElement | null {
    // The swiped element is positioned relative to the viewport, so the page
    // scroller must not gate the gesture.
    const scrollTarget = findScrollableTouchTarget(target, root, scrollAxis());
    const doc = ownerDocument(scrollTarget);
    return scrollTarget === doc.body || scrollTarget === doc.documentElement ? null : scrollTarget;
  }

  function startSwipeAtPosition(
    event: SwipeDismissEvent,
    position: { x: number; y: number },
    startOptions?: {
      ignoreScrollableTarget?: boolean | undefined;
      ignoreScrollableAncestors?: boolean | undefined;
    },
  ) {
    swipeFromScrollable = false;
    const touchLike = isTouchLikeEvent(event);
    const target = getTargetAtPoint(position, event);

    const element = options.element();
    const doc = ownerDocument(element);
    const body = doc.body;

    const scrollableTarget =
      touchLike && body ? findGestureScrollableTouchTarget(target, body) : null;
    const ignoreScrollableTarget = startOptions?.ignoreScrollableTarget ?? false;
    if (scrollableTarget && !ignoreScrollableTarget) {
      return false;
    }
    swipeFromScrollable = Boolean(scrollableTarget && ignoreScrollableTarget);

    // A touch may start on an interactive element; a mouse press there is the element's.
    if (!touchLike && closest(target, DEFAULT_IGNORE_SELECTOR)) {
      return false;
    }

    if (element && target) {
      const ignoreAncestors = startOptions?.ignoreScrollableAncestors ?? false;
      if (!ignoreAncestors && hasScrollableAncestor(target, element, scrollAxis())) {
        return false;
      }
    }

    cancelledSwipe = false;
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;

    dragStartPos = position;
    swipeStartTime = getValidTimeStamp(event.timeStamp);
    lastDragSample = null;
    hasStationarySample = false;
    lastDragVelocity = { x: 0, y: 0 };
    swipeCancelBaseline = position;
    lastMovePos = position;
    swipeThreshold = DEFAULT_SWIPE_THRESHOLD;
    swipeThresholdFunction = options.swipeThreshold ?? null;

    if (element) {
      resolveSwipeThreshold(primaryDirection());
      const transform = getElementTransform(element);

      initialTransform = transform;
      dragOffset = { x: transform.x, y: transform.y };
      recordDragSample({ x: transform.x, y: transform.y }, swipeStartTime);

      if (!isTouchEvent(event)) {
        safelyChangePointerCapture(element, event.pointerId, 'setPointerCapture');
      }
    }

    options.onSwipeStart?.(event);

    setSwiping(true);
    isFirstPointerMove = true;
    syncDragStyles(true);

    return true;
  }

  function resetPendingSwipeState() {
    clearPendingSwipeStartState();
    swipeFromScrollable = false;
    lastMovePos = null;
  }

  function clearPendingSwipeStartState() {
    pendingSwipe = false;
    pendingSwipeStartPos = null;
  }

  function cancelSwipeInteraction(event: PointerEvent) {
    resetPendingSwipeState();

    if (!swipingNow) {
      return;
    }

    setSwiping(false);

    dragOffset = { x: initialTransform.x, y: initialTransform.y };
    sawPrimaryButtonsOnMove = false;
    syncDragStyles(false);

    const element = options.element();
    if (element) {
      safelyChangePointerCapture(element, event.pointerId, 'releasePointerCapture');
    }
  }

  function canSwipeFromScrollEdgeOnPendingMove(
    scrollTarget: HTMLElement,
    deltaX: number,
    deltaY: number,
  ): boolean | null {
    // Swiping toward the axis start edge (down/right) is allowed when scrolled to the start;
    // toward the end edge (up/left) when scrolled to the end.
    const canSwipeOnAxis = (
      delta: number,
      scrollOffset: number,
      maxScrollOffset: number,
      allowTowardStart: boolean,
      allowTowardEnd: boolean,
    ) =>
      (delta > 0 && scrollOffset <= 0 && allowTowardStart) ||
      (delta < 0 && scrollOffset >= Math.max(0, maxScrollOffset) && allowTowardEnd);

    if (hasVertical() && deltaY !== 0) {
      return canSwipeOnAxis(
        deltaY,
        scrollTarget.scrollTop,
        scrollTarget.scrollHeight - scrollTarget.clientHeight,
        allow('down'),
        allow('up'),
      );
    }

    if (hasHorizontal() && deltaX !== 0) {
      return canSwipeOnAxis(
        deltaX,
        scrollTarget.scrollLeft,
        scrollTarget.scrollWidth - scrollTarget.clientWidth,
        allow('right'),
        allow('left'),
      );
    }

    return null;
  }

  function handleStart(event: SwipeDismissEvent) {
    if (!options.enabled || event.defaultPrevented) {
      return;
    }

    if (!isTouchEvent(event) && event.button !== 0) {
      return;
    }

    const startPos = getPrimaryPointerPosition(event);
    if (!startPos) {
      return;
    }

    pendingSwipe = true;
    pendingSwipeStartPos = startPos;
    swipeFromScrollable = false;
    sawPrimaryButtonsOnMove = !isTouchEvent(event);

    const allowedToStart = options.canStart
      ? options.canStart(startPos, { nativeEvent: event, direction: primaryDirection() })
      : true;
    if (!allowedToStart) {
      return;
    }

    if (startSwipeAtPosition(event, startPos)) {
      clearPendingSwipeStartState();
    }
  }

  function handleMoveCore(
    event: SwipeDismissEvent,
    currentTarget: EventTarget | null,
    position: { x: number; y: number },
    movement: { x: number; y: number },
  ) {
    if (!options.enabled || !swipingNow) {
      return;
    }

    const target = getTarget(event) as HTMLElement | null;
    if (isTouchLikeEvent(event) && !swipeFromScrollable) {
      if (isHTMLElement(currentTarget) && findGestureScrollableTouchTarget(target, currentTarget)) {
        return;
      }
    }

    if (!isTouchEvent(event)) {
      // Prevent text selection on Safari
      event.preventDefault();
    }

    if (isFirstPointerMove) {
      isFirstPointerMove = false;
      // Reset the drag origin to the first move's position to absorb the gap
      // between the press and the first move (iOS touch arrives offset), which
      // would make the dragged element jump.
      dragStartPos = position;
      const moveTime = getValidTimeStamp(event.timeStamp);
      if (moveTime !== null) {
        swipeStartTime = moveTime;
      }
      lastDragSample = null;
      hasStationarySample = false;
    }

    const clientX = position.x;
    const clientY = position.y;

    if (
      (movement.y < 0 && clientY > swipeCancelBaseline.y) ||
      (movement.y > 0 && clientY < swipeCancelBaseline.y)
    ) {
      swipeCancelBaseline = { x: swipeCancelBaseline.x, y: clientY };
    }

    if (
      (movement.x < 0 && clientX > swipeCancelBaseline.x) ||
      (movement.x > 0 && clientX < swipeCancelBaseline.x)
    ) {
      swipeCancelBaseline = { x: clientX, y: swipeCancelBaseline.y };
    }

    const deltaX = clientX - dragStartPos.x;
    const deltaY = clientY - dragStartPos.y;
    const cancelDeltaY = clientY - swipeCancelBaseline.y;
    const cancelDeltaX = clientX - swipeCancelBaseline.x;

    if (!intendedSwipeDirection) {
      let candidate: SwipeDirection;
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        candidate = deltaX > 0 ? 'right' : 'left';
      } else {
        candidate = deltaY > 0 ? 'down' : 'up';
      }

      if (allow(candidate)) {
        intendedSwipeDirection = candidate;
        maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
        resolveSwipeThreshold(candidate);
      }
    } else {
      const direction = intendedSwipeDirection;
      const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);
      if (currentDisplacement > swipeThreshold) {
        cancelledSwipe = false;
      } else if (
        !(allow('left') && allow('right')) &&
        !(allow('up') && allow('down')) &&
        maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
      ) {
        // A change of mind.
        cancelledSwipe = true;
      }
    }

    const dampedDelta = applyDirectionalDamping(deltaX, deltaY, directions());
    let newOffsetX = initialTransform.x;
    let newOffsetY = initialTransform.y;

    if (hasHorizontal()) {
      newOffsetX += dampedDelta.x;
    }
    if (hasVertical()) {
      newOffsetY += dampedDelta.y;
    }

    // Only rewrite drag styles when the drag offset changed.
    const previousOffset = dragOffset;
    const offsetChanged = newOffsetX !== previousOffset.x || newOffsetY !== previousOffset.y;

    dragOffset = { x: newOffsetX, y: newOffsetY };
    if (offsetChanged) {
      syncDragStyles(true);
    }
    recordDragSample({ x: newOffsetX, y: newOffsetY }, getValidTimeStamp(event.timeStamp));
  }

  function handleEnd(event: SwipeDismissEvent) {
    if (!options.enabled) {
      return;
    }

    const resolvedDragOffset = dragOffset;
    const resolvedInitialTransform = initialTransform;
    const releaseDeltaX = resolvedDragOffset.x - resolvedInitialTransform.x;
    const releaseDeltaY = resolvedDragOffset.y - resolvedInitialTransform.y;

    if (!swipingNow) {
      resetPendingSwipeState();
      return;
    }

    setSwiping(false);
    resetPendingSwipeState();
    sawPrimaryButtonsOnMove = false;

    const element = options.element();
    if (element && !isTouchEvent(event)) {
      safelyChangePointerCapture(element, event.pointerId, 'releasePointerCapture');
    }

    const deltaX = releaseDeltaX;
    const deltaY = releaseDeltaY;
    const startTime = swipeStartTime;
    const endTime = getValidTimeStamp(event.timeStamp);
    const durationMs =
      startTime !== null && endTime !== null && endTime > startTime ? endTime - startTime : 0;
    const velocityDurationMs = durationMs > 0 ? Math.max(durationMs, MIN_VELOCITY_DURATION_MS) : 0;
    const velocityX = velocityDurationMs > 0 ? deltaX / velocityDurationMs : 0;
    const velocityY = velocityDurationMs > 0 ? deltaY / velocityDurationMs : 0;
    let releaseVelocityX = lastDragVelocity.x;
    let releaseVelocityY = lastDragVelocity.y;
    const lastSample = lastDragSample;
    if (lastSample && endTime !== null && endTime >= lastSample.time) {
      const ageMs = endTime - lastSample.time;
      if (ageMs <= MAX_RELEASE_VELOCITY_AGE_MS) {
        const sampleDurationMs = Math.max(ageMs, MIN_RELEASE_VELOCITY_DURATION_MS);
        const deltaFromLastSampleX = resolvedDragOffset.x - lastSample.x;
        const deltaFromLastSampleY = resolvedDragOffset.y - lastSample.y;
        if (Math.abs(deltaFromLastSampleX) >= MIN_VELOCITY_SAMPLE_DISTANCE) {
          releaseVelocityX = deltaFromLastSampleX / sampleDurationMs;
        }
        if (Math.abs(deltaFromLastSampleY) >= MIN_VELOCITY_SAMPLE_DISTANCE) {
          releaseVelocityY = deltaFromLastSampleY / sampleDurationMs;
        }
      } else {
        releaseVelocityX = 0;
        releaseVelocityY = 0;
      }
    }

    const releaseDecision = options.onRelease?.({
      event,
      direction: intendedSwipeDirection,
      deltaX,
      deltaY,
      velocityX,
      velocityY,
      releaseVelocityX,
      releaseVelocityY,
    });
    const hasReleaseDecision = typeof releaseDecision === 'boolean';

    if (cancelledSwipe && !hasReleaseDecision) {
      dragOffset = { x: resolvedInitialTransform.x, y: resolvedInitialTransform.y };
      syncDragStyles(false);
      return;
    }

    let shouldClose = false;
    let dismissDirection: SwipeDirection | undefined;

    if (hasReleaseDecision) {
      shouldClose = releaseDecision;
      dismissDirection = intendedSwipeDirection ?? primaryDirection();
    } else {
      for (const direction of directions()) {
        if (getDisplacement(direction, deltaX, deltaY) > swipeThreshold) {
          shouldClose = true;
          dismissDirection = direction;
          break;
        }
      }
    }

    if (shouldClose && dismissDirection) {
      setDragDismissed(true);
      syncDragStyles(false);
      options.onDismiss?.(event, { direction: dismissDirection });
    } else {
      dragOffset = { x: resolvedInitialTransform.x, y: resolvedInitialTransform.y };
      syncDragStyles(false);
    }
  }

  function handleMove(event: SwipeDismissEvent, currentTarget: EventTarget | null) {
    const currentPos = getPrimaryPointerPosition(event);
    if (!currentPos) {
      return;
    }

    let endAfterMove = false;

    if (!isTouchEvent(event)) {
      const hasPrimaryButton = hasPrimaryMouseButton(event.buttons);
      if (hasPrimaryButton) {
        sawPrimaryButtonsOnMove = true;
      }

      // A non-primary button taking over (a right-click mid-drag) cancels the swipe.
      if (event.buttons !== 0 && !hasPrimaryButton) {
        cancelSwipeInteraction(event);
        return;
      }

      // A `buttons: 0` move means the primary button was already released, so
      // the gesture is over even if no pointerup reached us (fast trackpad
      // flicks): treat it as the release, after this move updates the offset.
      if (event.buttons === 0 && sawPrimaryButtonsOnMove) {
        if (!swipingNow) {
          // The gesture never activated — discard it.
          handleEnd(event);
          return;
        }
        endAfterMove = true;
      }
    }

    if (!swipingNow && pendingSwipe) {
      if (!isTouchLikeEvent(event) && event.defaultPrevented) {
        resetPendingSwipeState();
        return;
      }

      const allowedToStart = options.canStart
        ? options.canStart(currentPos, { nativeEvent: event, direction: primaryDirection() })
        : true;

      if (allowedToStart) {
        const pendingStartPos = pendingSwipeStartPos;
        let ignoreScrollableOnStart = false;
        if (isTouchLikeEvent(event)) {
          const element = options.element();
          if (pendingStartPos && element) {
            const target = getTargetAtPoint(currentPos, event);
            const body = ownerDocument(element).body;
            const scrollTarget = body ? findGestureScrollableTouchTarget(target, body) : null;

            if (
              scrollTarget &&
              (contains(element, scrollTarget) || contains(scrollTarget, element))
            ) {
              const canSwipeFromEdge = canSwipeFromScrollEdgeOnPendingMove(
                scrollTarget,
                currentPos.x - pendingStartPos.x,
                currentPos.y - pendingStartPos.y,
              );

              if (canSwipeFromEdge === false) {
                return;
              }

              if (canSwipeFromEdge === true) {
                ignoreScrollableOnStart = true;
              }
            }
          }
        }

        const started = startSwipeAtPosition(event, currentPos, {
          ignoreScrollableTarget: ignoreScrollableOnStart,
          ignoreScrollableAncestors: ignoreScrollableOnStart,
        });
        if (started) {
          clearPendingSwipeStartState();
          if (pendingStartPos && ignoreScrollableOnStart) {
            // Keep the displacement between touchstart and the move that
            // activates the swipe from a scroll edge, so quick flicks dismiss.
            dragStartPos = pendingStartPos;
            swipeCancelBaseline = pendingStartPos;
            lastMovePos = pendingStartPos;
            isFirstPointerMove = false;
          } else {
            // Start from the current in-bounds position without dropping
            // follow-up move displacement.
            swipeFromScrollable = false;
          }
        }
      }
    }

    const previousPos = lastMovePos;
    const movement =
      previousPos === null
        ? { x: 0, y: 0 }
        : { x: currentPos.x - previousPos.x, y: currentPos.y - previousPos.y };

    lastMovePos = currentPos;
    handleMoveCore(event, currentTarget, currentPos, movement);

    if (endAfterMove) {
      handleEnd(event);
    }
  }

  const onPointerMove = (event: PointerEvent) => handleMove(event, event.currentTarget);

  function getDragStyles(): Record<string, string | undefined> {
    // Tracks the swiping and dismissed flags; the offsets themselves are
    // written imperatively by `syncDragStyles` while the pointer moves.
    const swiping = isSwiping();
    const dismissed = dragDismissed();
    const deltaX = dragOffset.x - initialTransform.x;
    const deltaY = dragOffset.y - initialTransform.y;

    if (!swiping && deltaX === 0 && deltaY === 0 && !dismissed) {
      return { [options.movementCssVars.x]: '0px', [options.movementCssVars.y]: '0px' };
    }

    return {
      transition: swiping ? 'none' : undefined,
      // While swiping, freeze the element at its current visual transform so
      // it doesn't snap to the end position.
      transform: swiping ? getDragTransform(dragOffset, initialTransform.scale) : undefined,
      [options.movementCssVars.x]: `${deltaX}px`,
      [options.movementCssVars.y]: `${deltaY}px`,
    };
  }

  return {
    swiping: isSwiping,
    getPointerProps() {
      if (!options.enabled) {
        return {};
      }
      return {
        onPointerDown: handleStart,
        onPointerMove,
        onPointerUp: handleEnd,
        onPointerCancel: handleEnd,
      };
    },
    getTouchProps() {
      if (!options.enabled) {
        return {};
      }
      return {
        onTouchStart: handleStart,
        onTouchEnd: handleEnd,
        onTouchCancel: handleEnd,
      };
    },
    moveNative: (nativeEvent, currentTarget) => handleMove(nativeEvent, currentTarget),
    getDragStyles,
    reset,
  };
}
