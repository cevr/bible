// Upstream: packages/react/src/floating-ui-react/hooks/useClick.ts
//
// Opens and closes a popup by pressing its trigger, in Menu's mode: a
// pointer opens on mousedown (so a press-drag-release on an item works, as
// native menus do), a keyboard click on click, and a second press closes.
// A press on a second trigger while open moves the popup to it instead of
// closing. Upstream's click-only mode, `ignoreMouse`, `touchOpenDelay`,
// `reason` and `stickIfOpen` are left out: MenuTrigger, the one caller,
// uses none of them.
import { untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { getTarget } from '../../utils/dom.ts';
import { useAnimationFrame } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { isTypeableElement } from '../utils/element.ts';
import { isMouseLikePointerType, isVirtualPointerEvent } from '../utils/event.ts';

type PointerKind = 'mouse' | 'pen' | 'touch' | 'virtual' | undefined;

export function useClick(context: FloatingRootContext): { reference: HTMLProps } {
  let pointerType: PointerKind;
  const frame = useAnimationFrame();

  const setOpen = (nextOpen: boolean, nativeEvent: MouseEvent, target: HTMLElement) => {
    context.setOpen(nextOpen, createChangeEventDetails(REASONS.triggerPress, nativeEvent, target));
  };

  // A press opens a closed popup, or moves an open one to this trigger; a
  // press on the trigger that holds it closes it.
  const getNextOpen = (open: boolean, currentTarget: EventTarget | null) =>
    !open || untrack(context.domReferenceElement) !== currentTarget;

  const reference: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      pointerType =
        isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event)
          ? 'virtual'
          : (event.pointerType as PointerKind);
    },
    onMouseDown(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      const target = getTarget(event);
      const isTypeable = isTypeableElement(target);
      if (isTypeable || pointerType === 'virtual') {
        setOpen(nextOpen, event, (isTypeable ? target : event.currentTarget) as HTMLElement);
        return;
      }
      // Wait a frame so the mousedown's focus lands on the trigger before the popup takes it.
      const currentTarget = event.currentTarget as HTMLElement;
      frame.request(() => setOpen(nextOpen, event, currentTarget));
    },
    onClick(event: MouseEvent) {
      // A pointer press already acted on mousedown; only a keyboard click acts here.
      if (pointerType) {
        pointerType = undefined;
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      setOpen(nextOpen, event, event.currentTarget as HTMLElement);
    },
    onKeyDown() {
      pointerType = undefined;
    },
  };

  return { reference };
}
