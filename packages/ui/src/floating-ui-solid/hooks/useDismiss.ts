// Upstream: packages/react/src/floating-ui-react/hooks/useDismiss.ts
//
// Closes a popup on Escape and on a press outside it. A press inside a child
// popup of the floating tree is not outside; Escape closes the innermost
// open popup only (unless `bubbles`). A press that starts inside and ends
// outside (a text selection drag) does not close an `intentional` popup.
// Touch scrolls do not count as presses. The React-portal bookkeeping
// upstream (`insideReactTree`) is not needed: Solid's events follow the DOM.
import {
  getComputedStyle,
  getParentNode,
  isElement,
  isHTMLElement,
  isLastTraversableNode,
  isShadowRoot,
} from '@floating-ui/utils/dom';
import { createEffect, onCleanup, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { FloatingUIOpenChangeDetails, HTMLProps } from '../../internals/types.ts';
import { addEventListener, mergeCleanups, ownerDocument } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { Timeout, useTimeout } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { type FloatingTreeStore, getNodeChildren, useFloatingTree } from '../FloatingTree.tsx';
import {
  contains,
  createAttribute,
  getTarget,
  isEventTargetWithin,
  isRootElement,
} from '../utils/element.ts';
import { isVirtualClick } from '../utils/event.ts';

type PressType = 'intentional' | 'sloppy';

export interface ElementProps {
  reference?: HTMLProps | undefined;
  floating?: HTMLProps | undefined;
  item?: HTMLProps | ((props: { active?: boolean; selected?: boolean }) => HTMLProps) | undefined;
  trigger?: HTMLProps | undefined;
}

export function normalizeBubbles(
  normalizable?: boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined },
) {
  return {
    escapeKey:
      typeof normalizable === 'boolean' ? normalizable : (normalizable?.escapeKey ?? false),
    outsidePress:
      typeof normalizable === 'boolean' ? normalizable : (normalizable?.outsidePress ?? true),
  };
}

export interface UseDismissProps {
  /** Whether Escape and outside presses close the popup. Read live. */
  enabled?: boolean | undefined;
  /** Whether Escape closes the popup. */
  escapeKey?: boolean | undefined;
  /** Whether a press on the trigger closes the popup (read on each press). */
  referencePress?: (() => boolean) | undefined;
  /** Whether an outside press closes it, or a function deciding per event. */
  outsidePress?: boolean | ((event: MouseEvent | TouchEvent) => boolean) | undefined;
  /**
   * `sloppy` closes on pointer down outside; `intentional` waits for the click,
   * so a drag that starts inside never closes it. Per pointer type, or a function.
   */
  outsidePressEvent?:
    | PressType
    | { mouse: PressType; touch: PressType }
    | (() => PressType | { mouse: PressType; touch: PressType })
    | undefined;
  /** Whether Escape or an outside press also closes the parent popups. */
  bubbles?:
    | boolean
    | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined }
    | undefined;
  externalTree?: FloatingTreeStore | undefined;
}

export function useDismiss(
  context: FloatingRootContext,
  props: UseDismissProps = {},
): ElementProps {
  const { dataRef, events } = context;
  const tree = useFloatingTree(props.externalTree);

  const enabled = () => props.enabled ?? true;
  const escapeKey = () => props.escapeKey ?? true;
  const outsidePress = () => props.outsidePress ?? true;
  const referencePress = () => (props.referencePress ? props.referencePress() : false);
  const bubbles = () => normalizeBubbles(props.bubbles);

  let pressStartedInside = false;
  let pressStartPrevented = false;
  let suppressNextOutsideClick = false;
  let sawPressWhileOpen = false;
  let isComposing = false;
  let currentPointerType = '';
  let touchState: {
    startTime: number;
    startX: number;
    startY: number;
    dismissOnTouchEnd: boolean;
    dismissOnMouseDown: boolean;
  } | null = null;

  const cancelDismissOnEndTimeout = useTimeout();

  const hasBlockingChild = (bubbleKey: '__escapeKeyBubbles' | '__outsidePressBubbles') => {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    return children.some(
      (child) => child.context?.open && !child.context.dataRef.current[bubbleKey],
    );
  };

  const isEventWithinOwnElements = (event: Event) =>
    isEventTargetWithin(event, untrack(context.floatingElement)) ||
    isEventTargetWithin(event, untrack(context.domReferenceElement));

  const closeOnReferencePress = (event: Event) => {
    if (!enabled() || !referencePress()) {
      return;
    }
    context.setOpen(false, createChangeEventDetails(REASONS.triggerPress, event));
  };

  const closeOnEscapeKeyDown = (event: KeyboardEvent) => {
    if (!untrack(context.open) || !enabled() || !escapeKey() || event.key !== 'Escape') {
      return;
    }
    if (isComposing) {
      return;
    }
    const escapeKeyBubbles = bubbles().escapeKey;
    if (!escapeKeyBubbles && hasBlockingChild('__escapeKeyBubbles')) {
      return;
    }
    const eventDetails = createChangeEventDetails(REASONS.escapeKey, event);
    context.setOpen(false, eventDetails);
    if (!eventDetails.isCanceled) {
      event.preventDefault();
    }
    if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
      event.stopPropagation();
    }
  };

  const markPressStartedInside = (event: PointerEvent | MouseEvent) => {
    if (!untrack(context.open) || !enabled() || event.button !== 0) {
      return;
    }
    const target = getTarget(event) as Element | null;
    if (!contains(untrack(context.floatingElement), target)) {
      return;
    }
    if (!pressStartedInside) {
      pressStartedInside = true;
      pressStartPrevented = false;
    }
  };

  const markInsidePressStartPrevented = (event: PointerEvent | MouseEvent) => {
    if (!untrack(context.open) || !enabled() || !event.defaultPrevented) {
      return;
    }
    if (pressStartedInside) {
      pressStartPrevented = true;
    }
  };

  const handleOpenChange = (details: FloatingUIOpenChangeDetails) => {
    if (!details.open) {
      sawPressWhileOpen = false;
    }
  };
  events.on('openchange', handleOpenChange);
  onCleanup(() => events.off('openchange', handleOpenChange));

  createEffect(
    () => ({
      open: context.open(),
      enabled: enabled(),
      floating: context.floatingElement(),
      escapeKey: escapeKey(),
      outsidePressEnabled: outsidePress() !== false,
      bubbles: bubbles(),
    }),
    (deps) => {
      if (!deps.open || !deps.enabled) {
        if (!deps.open) {
          sawPressWhileOpen = false;
        }
        return undefined;
      }

      dataRef.current['__escapeKeyBubbles'] = deps.bubbles.escapeKey;
      dataRef.current['__outsidePressBubbles'] = deps.bubbles.outsidePress;

      const compositionTimeout = new Timeout();
      const preventedPressSuppressionTimeout = new Timeout();
      const doc = ownerDocument(deps.floating);

      function handleCompositionStart() {
        compositionTimeout.clear();
        isComposing = true;
      }

      function handleCompositionEnd() {
        // Safari fires `compositionend` before the Escape that ended the composition.
        compositionTimeout.start(platform.engine.webkit ? 5 : 0, () => {
          isComposing = false;
        });
      }

      function suppressImmediateOutsideClickAfterPreventedStart() {
        suppressNextOutsideClick = true;
        preventedPressSuppressionTimeout.start(0, () => {
          suppressNextOutsideClick = false;
        });
      }

      function resetPressStartState() {
        pressStartedInside = false;
        pressStartPrevented = false;
      }

      function getOutsidePressEvent(): PressType {
        const type = currentPointerType as 'pen' | 'mouse' | 'touch' | '';
        const computedType = type === 'pen' || !type ? 'mouse' : type;
        const value = props.outsidePressEvent ?? 'sloppy';
        const resolved = typeof value === 'function' ? value() : value;
        if (typeof resolved === 'string') {
          return resolved;
        }
        return resolved[computedType];
      }

      function shouldIgnoreEvent(event: Event) {
        const computed = getOutsidePressEvent();
        return (
          (computed === 'intentional' && event.type !== 'click') ||
          (computed === 'sloppy' && event.type === 'click')
        );
      }

      function isEventWithinFloatingTree(event: Event) {
        const nodeId = dataRef.current.floatingContext?.nodeId;
        const targetIsInsideChildren =
          tree &&
          getNodeChildren(tree.nodesRef.current, nodeId).some((node) =>
            isEventTargetWithin(event, node.context?.elements.floating),
          );
        return isEventWithinOwnElements(event) || targetIsInsideChildren;
      }

      function closeOnPressOutside(event: MouseEvent | PointerEvent | TouchEvent) {
        if (shouldIgnoreEvent(event)) {
          if (event.type !== 'click' && !isEventWithinOwnElements(event)) {
            preventedPressSuppressionTimeout.clear();
            suppressNextOutsideClick = false;
          }
          return;
        }

        const target = getTarget(event);
        const inertSelector = `[${createAttribute('inert')}]`;
        const targetRoot = isElement(target) ? target.getRootNode() : null;
        const markers = Array.from(
          (isShadowRoot(targetRoot)
            ? targetRoot
            : ownerDocument(untrack(context.floatingElement))
          ).querySelectorAll(inertSelector),
        );

        const triggers = context.triggerElements;
        if (
          target &&
          (triggers.hasElement(target as Element) ||
            triggers.hasMatchingElement((trigger) => contains(trigger, target as Element)))
        ) {
          return;
        }

        let targetRootAncestor = isElement(target) ? target : null;
        while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
          const nextParent = getParentNode(targetRootAncestor);
          if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
            break;
          }
          targetRootAncestor = nextParent;
        }

        // A press on an element a third-party modal added after this popup opened.
        if (
          markers.length &&
          isElement(target) &&
          !isRootElement(target) &&
          !contains(target, untrack(context.floatingElement)) &&
          markers.every((marker) => !contains(targetRootAncestor, marker))
        ) {
          return;
        }

        // A press on a scrollbar is not an outside press.
        if (isHTMLElement(target) && !('touches' in event)) {
          const lastTraversableNode = isLastTraversableNode(target);
          const style = getComputedStyle(target);
          const scrollRe = /auto|scroll/;
          const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
          const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
          const canScrollX =
            isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
          const canScrollY =
            isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
          const isRTL = style.direction === 'rtl';
          const mouse = event as MouseEvent;
          const pressedVerticalScrollbar =
            canScrollY &&
            (isRTL
              ? mouse.offsetX <= target.offsetWidth - target.clientWidth
              : mouse.offsetX > target.clientWidth);
          const pressedHorizontalScrollbar = canScrollX && mouse.offsetY > target.clientHeight;
          if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
            return;
          }
        }

        if (isEventWithinFloatingTree(event)) {
          return;
        }

        if (getOutsidePressEvent() === 'intentional') {
          if (
            (event as MouseEvent).detail !== 0 &&
            !isVirtualClick(event as MouseEvent) &&
            !sawPressWhileOpen
          ) {
            return;
          }
          if (suppressNextOutsideClick) {
            preventedPressSuppressionTimeout.clear();
            suppressNextOutsideClick = false;
            return;
          }
        }

        const press = outsidePress();
        if (typeof press === 'function' && !press(event as MouseEvent | TouchEvent)) {
          return;
        }

        if (hasBlockingChild('__outsidePressBubbles')) {
          return;
        }

        context.setOpen(false, createChangeEventDetails(REASONS.outsidePress, event));
      }

      function handlePointerDown(event: PointerEvent) {
        if (
          getOutsidePressEvent() !== 'sloppy' ||
          event.pointerType === 'touch' ||
          !untrack(context.open) ||
          !enabled() ||
          isEventWithinOwnElements(event)
        ) {
          return;
        }
        closeOnPressOutside(event);
      }

      function handleTouchStart(event: TouchEvent) {
        if (
          getOutsidePressEvent() !== 'sloppy' ||
          !untrack(context.open) ||
          !enabled() ||
          isEventWithinOwnElements(event)
        ) {
          return;
        }
        const touch = event.touches[0];
        if (touch) {
          touchState = {
            startTime: Date.now(),
            startX: touch.clientX,
            startY: touch.clientY,
            dismissOnTouchEnd: false,
            dismissOnMouseDown: true,
          };
          cancelDismissOnEndTimeout.start(1000, () => {
            if (touchState) {
              touchState.dismissOnTouchEnd = false;
              touchState.dismissOnMouseDown = false;
            }
          });
        }
      }

      // Listens on the event's own target once, so a handler that stops
      // propagation there still sees the press (as the bubbling phase would).
      function addTargetEventListenerOnce<E extends Event>(event: E, listener: (event: E) => void) {
        const target = getTarget(event);
        if (!target) {
          return;
        }
        const unsubscribe = addEventListener(target, event.type, () => {
          listener(event);
          unsubscribe();
        });
      }

      function handleTouchStartCapture(event: TouchEvent) {
        currentPointerType = 'touch';
        addTargetEventListenerOnce(event, handleTouchStart);
      }

      function closeOnPressOutsideCapture(event: PointerEvent | MouseEvent) {
        cancelDismissOnEndTimeout.clear();
        if (event.type === 'pointerdown') {
          if (event.button === 0) {
            sawPressWhileOpen = true;
          }
          currentPointerType = (event as PointerEvent).pointerType;
          markPressStartedInside(event);
        }
        if (event.type === 'mousedown') {
          markPressStartedInside(event);
        }
        if (event.type === 'mousedown' && touchState && !touchState.dismissOnMouseDown) {
          return;
        }
        addTargetEventListenerOnce(event, (targetEvent) => {
          if (targetEvent.type === 'pointerdown') {
            handlePointerDown(targetEvent as PointerEvent);
          } else {
            closeOnPressOutside(targetEvent as MouseEvent);
          }
        });
      }

      function handlePressEndCapture(event: PointerEvent | MouseEvent) {
        if (event.type === 'pointercancel') {
          sawPressWhileOpen = false;
        }
        if (!pressStartedInside) {
          return;
        }
        const startedPrevented = pressStartPrevented;
        resetPressStartState();
        if (getOutsidePressEvent() !== 'intentional') {
          return;
        }
        if (event.type === 'pointercancel') {
          if (startedPrevented) {
            suppressImmediateOutsideClickAfterPreventedStart();
          }
          return;
        }
        if (isEventWithinFloatingTree(event)) {
          return;
        }
        if (startedPrevented) {
          suppressImmediateOutsideClickAfterPreventedStart();
          return;
        }
        const press = outsidePress();
        if (typeof press === 'function' && !press(event as MouseEvent)) {
          return;
        }
        preventedPressSuppressionTimeout.clear();
        suppressNextOutsideClick = true;
      }

      function handleTouchMove(event: TouchEvent) {
        if (getOutsidePressEvent() !== 'sloppy' || !touchState || isEventWithinOwnElements(event)) {
          return;
        }
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const deltaX = Math.abs(touch.clientX - touchState.startX);
        const deltaY = Math.abs(touch.clientY - touchState.startY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > 5) {
          touchState.dismissOnTouchEnd = true;
        }
        if (distance > 10) {
          closeOnPressOutside(event);
          cancelDismissOnEndTimeout.clear();
          touchState = null;
        }
      }

      function handleTouchEnd(event: TouchEvent) {
        if (getOutsidePressEvent() !== 'sloppy' || !touchState || isEventWithinOwnElements(event)) {
          return;
        }
        if (touchState.dismissOnTouchEnd) {
          closeOnPressOutside(event);
        }
        cancelDismissOnEndTimeout.clear();
        touchState = null;
      }

      const unsubscribe = mergeCleanups(
        deps.escapeKey &&
          mergeCleanups(
            addEventListener(doc, 'keydown', closeOnEscapeKeyDown),
            addEventListener(doc, 'compositionstart', handleCompositionStart),
            addEventListener(doc, 'compositionend', handleCompositionEnd),
          ),
        deps.outsidePressEnabled &&
          mergeCleanups(
            addEventListener(doc, 'click', closeOnPressOutsideCapture, true),
            addEventListener(doc, 'pointerdown', closeOnPressOutsideCapture, true),
            addEventListener(doc, 'pointerup', handlePressEndCapture, true),
            addEventListener(doc, 'pointercancel', handlePressEndCapture, true),
            addEventListener(doc, 'mousedown', closeOnPressOutsideCapture, true),
            addEventListener(doc, 'mouseup', handlePressEndCapture, true),
            addEventListener(doc, 'touchstart', handleTouchStartCapture, {
              capture: true,
              passive: true,
            }),
            addEventListener<TouchEvent>(
              doc,
              'touchmove',
              (event) => addTargetEventListenerOnce(event, handleTouchMove),
              { capture: true, passive: true },
            ),
            addEventListener<TouchEvent>(
              doc,
              'touchend',
              (event) => addTargetEventListenerOnce(event, handleTouchEnd),
              { capture: true, passive: true },
            ),
          ),
      );

      return () => {
        unsubscribe();
        compositionTimeout.clear();
        preventedPressSuppressionTimeout.clear();
        resetPressStartState();
        suppressNextOutsideClick = false;
      };
    },
  );

  const reference: HTMLProps = {
    onKeyDown: closeOnEscapeKeyDown,
    onPointerDown: closeOnReferencePress,
    onClick: closeOnReferencePress,
  };

  const floating: HTMLProps = {
    onKeyDown: closeOnEscapeKeyDown,
    onPointerDown: markInsidePressStartPrevented,
    onMouseDown: markInsidePressStartPrevented,
  };

  return { reference, floating, trigger: reference };
}
