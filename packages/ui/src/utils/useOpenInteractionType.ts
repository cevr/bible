// Upstream: packages/react/src/utils/useOpenInteractionType.ts,
// packages/utils/src/useEnhancedClickHandler.ts
//
// What opened a popup: mouse, touch, pen or keyboard. The trigger's click
// reports it (a click with `detail` 0 came from the keyboard; browsers whose
// click is not a PointerEvent fall back to the pointerdown before it). The
// focus manager reads it to choose initial focus, and a touch-opened popup
// skips the scroll lock. It resets when the popup closes.
import { type Accessor, createEffect, createSignal, untrack } from 'solid-js';

import type { InteractionType } from '../floating-ui-solid/FloatingFocusManager.tsx';
import type { HTMLProps } from '../internals/types.ts';
import { platform } from './platform.ts';

export type { InteractionType };

/** Calls `handler` with the pointer type of each click (`keyboard` for a keyboard click). */
function useEnhancedClickHandler(
  handler: (event: MouseEvent | PointerEvent, interactionType: InteractionType) => void,
) {
  let lastClickInteractionType: InteractionType = '';
  return {
    onPointerDown(event: PointerEvent) {
      if (event.defaultPrevented) {
        return;
      }
      lastClickInteractionType = event.pointerType as InteractionType;
      handler(event, event.pointerType as InteractionType);
    },
    onClick(event: MouseEvent | PointerEvent) {
      if (event.detail === 0) {
        handler(event, 'keyboard');
        return;
      }
      if ('pointerType' in event) {
        handler(event, event.pointerType as InteractionType);
      } else {
        handler(event, lastClickInteractionType);
      }
      lastClickInteractionType = '';
    },
  };
}

/** The trigger props that record how a closed popup was opened. */
function useOpenMethodTriggerProps(
  open: Accessor<boolean>,
  setOpenMethod: (interactionType: InteractionType | null) => void,
): HTMLProps {
  return useEnhancedClickHandler((_, interactionType) => {
    if (!untrack(open)) {
      // iOS Safari's hit slop fires mousedown without pointerdown outside the bounds.
      setOpenMethod(interactionType || (platform.os.ios ? 'touch' : ''));
    }
  });
}

export function useOpenInteractionType(open: Accessor<boolean>) {
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(null, {
    ownedWrite: true,
  });
  const triggerProps = useOpenMethodTriggerProps(open, (value) => setOpenMethod(() => value));
  createEffect(open, (isOpen) => {
    if (!isOpen) {
      setOpenMethod(null);
    }
  });
  return { openMethod, triggerProps };
}
