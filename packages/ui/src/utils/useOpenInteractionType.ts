// Upstream: packages/react/src/utils/useOpenInteractionType.ts,
// packages/utils/src/useEnhancedClickHandler.ts (folded in)
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

export function useOpenInteractionType(open: Accessor<boolean>) {
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(null, {
    ownedWrite: true,
  });
  createEffect(open, (isOpen) => {
    if (!isOpen) {
      setOpenMethod(null);
    }
  });

  // Records how a closed popup is being opened.
  const record = (interactionType: InteractionType) => {
    if (!untrack(open)) {
      // iOS Safari's hit slop fires mousedown without pointerdown outside the bounds.
      setOpenMethod(() => interactionType || (platform.os.ios ? 'touch' : ''));
    }
  };

  let lastClickInteractionType: InteractionType = '';
  const triggerProps: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      if (event.defaultPrevented) {
        return;
      }
      lastClickInteractionType = event.pointerType as InteractionType;
      record(lastClickInteractionType);
    },
    onClick(event: MouseEvent | PointerEvent) {
      if (event.detail === 0) {
        record('keyboard');
        return;
      }
      record(
        'pointerType' in event ? (event.pointerType as InteractionType) : lastClickInteractionType,
      );
      lastClickInteractionType = '';
    },
  };

  return { openMethod, triggerProps };
}
