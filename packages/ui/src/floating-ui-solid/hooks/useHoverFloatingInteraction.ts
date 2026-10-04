// Upstream: packages/react/src/floating-ui-react/hooks/useHoverFloatingInteraction.ts
//
// The popup side of hover: entering the popup cancels a pending close,
// leaving it closes a hover-opened popup (through the safe polygon when one
// is active), and a parent whose child closed because the pointer left both
// closes too. While the pointer crosses to a hover-opened popup with
// `blockPointerEvents`, everything else in the scope ignores the pointer.
import { isElement } from '@floating-ui/utils/dom';
import { createEffect, onCleanup, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { addEventListener, mergeCleanups, ownerDocument } from '../../utils/dom.ts';
import { useTimeout } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { getNodeChildren, useFloatingParentNodeId, useFloatingTree } from '../FloatingTree.tsx';
import { closest, contains, getTarget, isInteractiveElement } from '../utils/element.ts';
import {
  applySafePolygonPointerEventsMutation,
  clearSafePolygonPointerEventsMutation,
  getDelay,
  isClickLikeOpenEvent as isClickLikeOpenEventShared,
  isHoverOpenEvent,
  isInsideEnabledTrigger,
  useHoverInteractionSharedState,
} from './useHoverShared.ts';

export interface UseHoverFloatingInteractionProps {
  enabled?: boolean | undefined;
  closeDelay?: number | (() => number) | undefined;
  /** The tree node id, for a popup in the tree without a floating context. */
  nodeId?: string | undefined;
}

export function useHoverFloatingInteraction(
  context: FloatingRootContext,
  props: UseHoverFloatingInteractionProps = {},
): void {
  const { dataRef } = context;
  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const instance = useHoverInteractionSharedState(context);
  const childClosedTimeout = useTimeout();

  const enabled = () => props.enabled ?? true;
  const isClickLikeOpenEvent = () =>
    isClickLikeOpenEventShared(dataRef.current.openEvent?.type, instance.interactedInside);
  const isHoverOpen = () => isHoverOpenEvent(dataRef.current.openEvent?.type);
  const clearPointerEvents = () => clearSafePolygonPointerEventsMutation(instance);

  createEffect(context.open, (open) => {
    if (!open) {
      instance.pointerType = undefined;
      instance.restTimeoutPending = false;
      instance.interactedInside = false;
      clearPointerEvents();
    }
  });

  onCleanup(clearPointerEvents);

  createEffect(
    () =>
      [
        enabled(),
        context.open(),
        context.domReferenceElement(),
        context.floatingElement(),
      ] as const,
    ([isEnabled, open, domReferenceElement, floatingElement]) => {
      if (
        !isEnabled ||
        !open ||
        !instance.handleCloseOptions?.blockPointerEvents ||
        !isHoverOpen() ||
        !isElement(domReferenceElement) ||
        !floatingElement
      ) {
        return undefined;
      }
      const ref = domReferenceElement as HTMLElement | SVGSVGElement;
      const doc = ownerDocument(floatingElement);
      const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context
        ?.elements.floating;
      if (parentFloating) {
        parentFloating.style.pointerEvents = '';
      }
      // A kept-mounted submenu can be in the tree before it opens, so a cached
      // scope may be the submenu itself, which would not shield the parent's items.
      const cachedScopeElement =
        instance.pointerEventsScopeElement !== floatingElement
          ? instance.pointerEventsScopeElement
          : null;
      const parentScopeElement = parentFloating !== floatingElement ? parentFloating : null;
      const scopeElement =
        instance.handleCloseOptions.getScope?.() ??
        cachedScopeElement ??
        parentScopeElement ??
        closest<HTMLElement>(ref, '[data-rootownerid]') ??
        doc.body;
      applySafePolygonPointerEventsMutation(instance, {
        scopeElement,
        referenceElement: ref,
        floatingElement,
      });
      return clearPointerEvents;
    },
  );

  const hasParentChildren = () =>
    Boolean(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);

  const closeWithDelay = (event: MouseEvent) => {
    const closeDelay = getDelay(props.closeDelay ?? 0, 'close', instance.pointerType);
    const close = () => {
      context.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
      tree?.events.emit('floating.closed', event);
    };
    if (closeDelay) {
      instance.openChangeTimeout.start(closeDelay, close);
    } else {
      instance.openChangeTimeout.clear();
      close();
    }
  };

  const onNodeClosed = (event: unknown) => {
    if (!tree || !parentId || hasParentChildren()) {
      return;
    }
    // Let a mouseenter on the parent land first, in case the child closed because the pointer moved into it.
    childClosedTimeout.start(0, () => {
      tree.events.off('floating.closed', onNodeClosed);
      context.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event as MouseEvent));
      tree.events.emit('floating.closed', event);
    });
  };

  const handleInteractInside = (event: PointerEvent) => {
    const target = getTarget(event) as Element | null;
    if (!isInteractiveElement(target)) {
      instance.interactedInside = false;
      return;
    }
    instance.interactedInside = closest(target, '[aria-haspopup]') != null;
  };

  const onFloatingMouseEnter = () => {
    instance.openChangeTimeout.clear();
    childClosedTimeout.clear();
    tree?.events.off('floating.closed', onNodeClosed);
    clearPointerEvents();
  };

  const onFloatingMouseLeave = (event: MouseEvent) => {
    if (hasParentChildren() && tree) {
      tree.events.on('floating.closed', onNodeClosed);
      return;
    }
    if (isInsideEnabledTrigger(event.relatedTarget, context.triggerElements)) {
      return;
    }
    const currentNodeId = dataRef.current.floatingContext?.nodeId ?? props.nodeId;
    const relatedTarget = event.relatedTarget;
    const isMovingIntoDescendantFloating =
      tree &&
      currentNodeId &&
      isElement(relatedTarget) &&
      getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node) =>
        contains(node.context?.elements.floating, relatedTarget),
      );
    if (isMovingIntoDescendantFloating) {
      return;
    }
    if (instance.handler) {
      instance.handler(event);
      return;
    }
    clearPointerEvents();
    if (isHoverOpen() && !isClickLikeOpenEvent()) {
      closeWithDelay(event);
    }
  };

  createEffect(
    () => [enabled(), context.floatingElement()] as const,
    ([isEnabled, floating]) => {
      if (!isEnabled) {
        return undefined;
      }
      return mergeCleanups(
        floating ? addEventListener(floating, 'mouseenter', onFloatingMouseEnter) : undefined,
        floating ? addEventListener(floating, 'mouseleave', onFloatingMouseLeave) : undefined,
        floating
          ? addEventListener(floating, 'pointerdown', handleInteractInside, true)
          : undefined,
        () => untrack(() => tree?.events.off('floating.closed', onNodeClosed)),
      );
    },
  );
}
