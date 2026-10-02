// Upstream: packages/react/src/floating-ui-react/hooks/useHoverReferenceInteraction.ts
//
// Opens a popup when the pointer enters its trigger (after `delay`, or once
// the pointer rests for `restMs`) and closes it when the pointer leaves,
// unless a `handleClose` (the safe polygon) is given: then the pointer may
// travel to the popup. Moving between triggers of one popup moves it at once.
// A popup opened by a click is not closed by hover.
import { isElement } from '@floating-ui/utils/dom';
import { type Accessor, createEffect, onCleanup, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { FloatingUIOpenChangeDetails, HTMLProps } from '../../internals/types.ts';
import { addEventListener, mergeCleanups, ownerDocument } from '../../utils/dom.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { type FloatingTreeStore, useFloatingTree } from '../FloatingTree.tsx';
import { contains, getTarget } from '../utils/element.ts';
import { isMouseLikePointerType } from '../utils/event.ts';
import {
  applySafePolygonPointerEventsMutation,
  clearSafePolygonPointerEventsMutation,
  type Delay,
  getDelay,
  getRestMs,
  type HandleClose,
  isClickLikeOpenEvent as isClickLikeOpenEventShared,
  isInsideEnabledTrigger,
  useHoverInteractionSharedState,
} from './useHoverShared.ts';

export interface UseHoverReferenceInteractionProps {
  enabled?: boolean | undefined;
  handleClose?: HandleClose | null | undefined;
  restMs?: number | (() => number) | undefined;
  delay?: Delay | (() => Delay) | undefined;
  /** Whether a mousemove over the trigger (not only mouseenter) opens. */
  move?: boolean | undefined;
  mouseOnly?: boolean | undefined;
  externalTree?: FloatingTreeStore | undefined;
  /** Whether these props belong to the active trigger (the one the popup sits on). */
  isActiveTrigger?: boolean | undefined;
  /** The trigger to listen on; the active trigger when not given. */
  triggerElement?: Accessor<Element | null> | undefined;
  isClosing?: (() => boolean) | undefined;
  /** Called before each hover open; `false` vetoes it. */
  shouldOpen?: (() => boolean) | undefined;
  /** Also cancels a pending open on the trigger's `mouseout`, for a `mouseleave` Chrome drops in a fast sweep. */
  guardStaleOpen?: boolean | undefined;
}

export function useHoverReferenceInteraction(
  context: FloatingRootContext,
  props: UseHoverReferenceInteractionProps = {},
): HTMLProps {
  const { dataRef, events } = context;
  const tree = useFloatingTree(props.externalTree);
  const instance = useHoverInteractionSharedState(context);
  let isHoverCloseActive = false;

  const enabled = () => props.enabled ?? true;
  const isClickLikeOpenEvent = () =>
    isClickLikeOpenEventShared(dataRef.current.openEvent?.type, instance.interactedInside);
  const checkShouldOpen = () => props.shouldOpen?.() !== false;

  const isOverInactiveTrigger = (
    currentDomReference: Element | null,
    currentTarget: Element,
    target: EventTarget | null,
  ): boolean => {
    const allTriggers = context.triggerElements;
    if (allTriggers.hasElement(currentTarget)) {
      return !currentDomReference || !contains(currentDomReference, currentTarget);
    }
    if (!isElement(target)) {
      return false;
    }
    return (
      allTriggers.hasMatchingElement((trigger) => contains(trigger, target)) &&
      (!currentDomReference || !contains(currentDomReference, target))
    );
  };

  const cleanupMouseMoveHandler = () => {
    if (!instance.handler) {
      return;
    }
    ownerDocument(untrack(context.domReferenceElement)).removeEventListener(
      'mousemove',
      instance.handler,
    );
    instance.handler = undefined;
  };

  const clearPointerEvents = () => clearSafePolygonPointerEventsMutation(instance);

  createEffect(
    () => [props.isActiveTrigger ?? true, props.handleClose] as const,
    ([isActive, handleClose]) => {
      if (isActive) {
        instance.handleCloseOptions = handleClose?.__options;
      }
    },
  );

  onCleanup(cleanupMouseMoveHandler);

  // A close cancels a pending open.
  const onOpenChangeLocal = (details: FloatingUIOpenChangeDetails) => {
    if (!enabled()) {
      return;
    }
    if (!details.open) {
      isHoverCloseActive = details.reason === REASONS.triggerHover;
      cleanupMouseMoveHandler();
      instance.openChangeTimeout.clear();
      instance.restTimeout.clear();
      instance.blockMouseMove = true;
      instance.restTimeoutPending = false;
    } else {
      isHoverCloseActive = false;
    }
  };
  events.on('openchange', onOpenChangeLocal);
  onCleanup(() => events.off('openchange', onOpenChangeLocal));

  const closeWithDelay = (event: MouseEvent, runElseBranch = true) => {
    const closeDelay = getDelay(props.delay ?? 0, 'close', instance.pointerType);
    const close = () => {
      context.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
      tree?.events.emit('floating.closed', event);
    };
    if (closeDelay) {
      instance.openChangeTimeout.start(closeDelay, close);
    } else if (runElseBranch) {
      instance.openChangeTimeout.clear();
      close();
    }
  };

  const onMouseEnter = (event: MouseEvent) => {
    instance.openChangeTimeout.clear();
    instance.blockMouseMove = false;

    if ((props.mouseOnly ?? false) && !isMouseLikePointerType(instance.pointerType)) {
      return;
    }

    const restMsValue = getRestMs(props.restMs ?? 0);
    const openDelay = getDelay(props.delay ?? 0, 'open', instance.pointerType);
    const eventTarget = getTarget(event);
    const currentTarget = event.currentTarget as HTMLElement | null;
    const currentDomReference = untrack(context.domReferenceElement);
    let triggerNode = currentTarget;

    if (isElement(eventTarget) && !context.triggerElements.hasElement(eventTarget)) {
      for (const triggerElement of context.triggerElements.elements()) {
        if (contains(triggerElement, eventTarget)) {
          triggerNode = triggerElement as HTMLElement;
          break;
        }
      }
    }

    if (
      isElement(currentTarget) &&
      isElement(currentDomReference) &&
      !context.triggerElements.hasElement(currentTarget) &&
      contains(currentTarget, currentDomReference)
    ) {
      triggerNode = currentDomReference as HTMLElement;
    }

    const isOverInactive =
      triggerNode == null
        ? false
        : isOverInactiveTrigger(currentDomReference, triggerNode, eventTarget);
    const isOpen = untrack(context.open);
    const isInClosingTransition =
      props.isClosing?.() ?? untrack(context.transitionStatus) === 'ending';
    const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActive;
    const isReenteringSameTriggerDuringCloseTransition =
      !isOverInactive &&
      isElement(triggerNode) &&
      isElement(currentDomReference) &&
      contains(currentDomReference, triggerNode) &&
      isHoverCloseTransition;
    const isRestOnlyDelay = restMsValue > 0 && !openDelay;
    const shouldOpenImmediately =
      (isOverInactive && (isOpen || isHoverCloseTransition)) ||
      isReenteringSameTriggerDuringCloseTransition;
    const shouldOpen = !isOpen || isOverInactive;
    const open = () =>
      context.setOpen(
        true,
        createChangeEventDetails(REASONS.triggerHover, event, triggerNode ?? undefined),
      );

    if (shouldOpenImmediately) {
      if (checkShouldOpen()) {
        open();
      }
      return;
    }
    if (isRestOnlyDelay) {
      return;
    }
    if (openDelay) {
      instance.openChangeTimeout.start(openDelay, () => {
        if (shouldOpen && checkShouldOpen()) {
          open();
        }
      });
    } else if (shouldOpen && checkShouldOpen()) {
      open();
    }
  };

  const onMouseLeave = (event: MouseEvent) => {
    if (isClickLikeOpenEvent()) {
      clearPointerEvents();
      return;
    }
    cleanupMouseMoveHandler();

    const doc = ownerDocument(untrack(context.domReferenceElement));
    instance.restTimeout.clear();
    instance.restTimeoutPending = false;

    const handleCloseContextBase = dataRef.current.floatingContext;

    if (isInsideEnabledTrigger(event.relatedTarget, context.triggerElements)) {
      return;
    }

    const handleClose = props.handleClose;
    if (handleClose && handleCloseContextBase) {
      if (!untrack(context.open)) {
        instance.openChangeTimeout.clear();
      }
      const currentTrigger = untrack(() => props.triggerElement?.()) ?? null;
      instance.handler = handleClose({
        placement: handleCloseContextBase.placement,
        elements: handleCloseContextBase.elements,
        nodeId: handleCloseContextBase.nodeId,
        tree,
        x: event.clientX,
        y: event.clientY,
        onClose() {
          clearPointerEvents();
          cleanupMouseMoveHandler();
          if (
            enabled() &&
            !isClickLikeOpenEvent() &&
            (currentTrigger == null || currentTrigger === untrack(context.domReferenceElement))
          ) {
            closeWithDelay(event, true);
          }
        },
      });
      doc.addEventListener('mousemove', instance.handler);
      instance.handler(event);
      return;
    }

    const shouldClose =
      instance.pointerType === 'touch'
        ? !contains(untrack(context.floatingElement), event.relatedTarget as Element | null)
        : true;
    if (shouldClose) {
      closeWithDelay(event);
    }
  };

  createEffect(
    () =>
      [
        enabled(),
        props.triggerElement?.() ??
          ((props.isActiveTrigger ?? true) ? context.domReferenceElement() : null),
        props.move ?? true,
        props.guardStaleOpen ?? false,
      ] as const,
    ([isEnabled, trigger, move, guardStaleOpen]) => {
      if (!isEnabled || !isElement(trigger)) {
        return undefined;
      }
      const onMouseOut = (event: MouseEvent) => {
        if (contains(trigger, event.relatedTarget as Element | null)) {
          return;
        }
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        instance.restTimeoutPending = false;
      };
      return mergeCleanups(
        move ? addEventListener(trigger, 'mousemove', onMouseEnter, { once: true }) : undefined,
        addEventListener(trigger, 'mouseenter', onMouseEnter),
        addEventListener(trigger, 'mouseleave', onMouseLeave),
        guardStaleOpen ? addEventListener(trigger, 'mouseout', onMouseOut) : undefined,
      );
    },
  );

  const setPointerType = (event: PointerEvent) => {
    if (enabled()) {
      instance.pointerType = event.pointerType;
    }
  };

  return {
    onPointerDown: setPointerType,
    onPointerEnter: setPointerType,
    onMouseMove(event: MouseEvent) {
      if (!enabled()) {
        return;
      }
      const trigger = event.currentTarget as HTMLElement;
      const currentDomReference = untrack(context.domReferenceElement);
      const currentOpen = untrack(context.open);
      const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);

      if ((props.mouseOnly ?? false) && !isMouseLikePointerType(instance.pointerType)) {
        return;
      }

      if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
        const floatingElement = untrack(context.floatingElement);
        if (floatingElement) {
          const scopeElement =
            instance.handleCloseOptions.getScope?.() ?? trigger.ownerDocument.body;
          applySafePolygonPointerEventsMutation(instance, {
            scopeElement,
            referenceElement: trigger,
            floatingElement,
          });
        }
      }

      const restMsValue = getRestMs(props.restMs ?? 0);
      if ((currentOpen && !isOverInactive) || restMsValue === 0) {
        return;
      }
      if (
        !isOverInactive &&
        instance.restTimeoutPending &&
        event.movementX ** 2 + event.movementY ** 2 < 2
      ) {
        return;
      }

      instance.restTimeout.clear();

      const handleMouseMove = () => {
        instance.restTimeoutPending = false;
        if (isClickLikeOpenEvent()) {
          return;
        }
        const latestOpen = untrack(context.open);
        if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) {
          context.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, trigger));
        }
      };

      if (instance.pointerType === 'touch' || (isOverInactive && currentOpen)) {
        handleMouseMove();
      } else {
        instance.restTimeoutPending = true;
        instance.restTimeout.start(restMsValue, handleMouseMove);
      }
    },
  };
}
