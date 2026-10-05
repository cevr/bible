// Upstream: packages/react/src/floating-ui-react/hooks/useClick.ts
//
// Opens and closes a popup by pressing its trigger: on click, or on
// mousedown (so a press-drag-release on an item works, as native menus do).
// A press on a second trigger while open moves the popup to it instead of
// closing. Upstream's `stickIfOpen` (a popup opened by hover or focus stays
// open on the click that follows) is left out: no trigger here opens that way.
import { untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { useAnimationFrame, useTimeout } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { getTarget, isTypeableElement } from '../utils/element.ts';
import { isMouseLikePointerType, isVirtualPointerEvent } from '../utils/event.ts';

export interface UseClickProps {
  enabled?: boolean | undefined;
  /** `mousedown` opens on press; `mousedown-only` also ignores the click after it. */
  event?: 'click' | 'mousedown' | 'mousedown-only' | undefined;
  /** Whether a second press closes the popup. */
  toggle?: boolean | undefined;
  ignoreMouse?: boolean | undefined;
  touchOpenDelay?: number | undefined;
  reason?: typeof REASONS.triggerPress | typeof REASONS.inputPress | undefined;
}

type PointerKind = 'mouse' | 'pen' | 'touch' | 'virtual' | undefined;

export function useClick(
  context: FloatingRootContext,
  props: UseClickProps = {},
): { reference: HTMLProps } {
  let pointerType: PointerKind;
  const frame = useAnimationFrame();
  const touchOpenTimeout = useTimeout();

  const enabled = () => props.enabled ?? true;
  const eventOption = () => props.event ?? 'click';

  const setOpenWithTouchDelay = (
    nextOpen: boolean,
    nativeEvent: MouseEvent,
    target: HTMLElement,
    kind: PointerKind,
  ) => {
    const details = createChangeEventDetails(
      props.reason ?? REASONS.triggerPress,
      nativeEvent,
      target,
    );
    const delay = props.touchOpenDelay ?? 0;
    if (nextOpen && kind === 'touch' && delay > 0) {
      touchOpenTimeout.start(delay, () => context.setOpen(true, details));
    } else {
      context.setOpen(nextOpen, details);
    }
  };

  const getNextOpen = (open: boolean, currentTarget: EventTarget | null) => {
    const hasClickedOnInactiveTrigger = untrack(context.domReferenceElement) !== currentTarget;
    if (!open || hasClickedOnInactiveTrigger) {
      return true;
    }
    return !(props.toggle ?? true);
  };

  const reference: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      if (!enabled()) {
        return;
      }
      pointerType =
        isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event)
          ? 'virtual'
          : (event.pointerType as PointerKind);
    },
    onMouseDown(event: MouseEvent) {
      if (!enabled()) {
        return;
      }
      const kind = pointerType;
      if (
        event.button !== 0 ||
        eventOption() === 'click' ||
        (isMouseLikePointerType(kind, true) && props.ignoreMouse)
      ) {
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      const target = getTarget(event);
      const isTypeable = isTypeableElement(target);
      if (isTypeable || kind === 'virtual') {
        setOpenWithTouchDelay(
          nextOpen,
          event,
          (isTypeable ? target : event.currentTarget) as HTMLElement,
          kind,
        );
        return;
      }
      // Wait a frame so the mousedown's focus lands on the trigger before the popup takes it.
      const currentTarget = event.currentTarget as HTMLElement;
      frame.request(() => setOpenWithTouchDelay(nextOpen, event, currentTarget, kind));
    },
    onClick(event: MouseEvent) {
      if (!enabled() || eventOption() === 'mousedown-only') {
        return;
      }
      const kind = pointerType;
      if (eventOption() === 'mousedown' && kind) {
        pointerType = undefined;
        return;
      }
      if (isMouseLikePointerType(kind, true) && props.ignoreMouse) {
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      setOpenWithTouchDelay(nextOpen, event, event.currentTarget as HTMLElement, kind);
    },
    onKeyDown() {
      pointerType = undefined;
    },
  };

  return { reference };
}
