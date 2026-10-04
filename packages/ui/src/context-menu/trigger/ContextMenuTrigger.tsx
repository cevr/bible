// Upstream: packages/react/src/context-menu/trigger/ContextMenuTrigger.tsx
//
// The area that opens the context menu: a right click opens it at the
// pointer, and a touch held still for 500ms opens it at the touch (moving
// more than 10px first cancels). The browser's own context menu is
// suppressed over the area and the menu's backdrops. After a right click,
// releasing the button over nothing in the menu more than 500ms later closes
// it again, so a press-drag-release gesture works like a native menu.
import type { JSX } from '@solidjs/web';
import { createEffect, omit, onCleanup, untrack } from 'solid-js';

import { stopEvent } from '../../floating-ui-solid/utils/event.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useMenuRootContext } from '../../menu/root/MenuRootContext.ts';
import { findRootOwnerId } from '../../menu/utils/isKeyboardOpen.ts';
import { addEventListener, contains, getTarget, ownerDocument } from '../../utils/dom.ts';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useContextMenuRootContextStrict } from '../root/ContextMenuRootContext.ts';

/** How long a touch is held before the menu opens, and the mouseup grace after a right click. */
export const LONG_PRESS_DELAY = 500;
/** How far a held touch may move, in px, before the long press is cancelled. */
export const LONG_PRESS_MOVE_THRESHOLD = 10;

export interface ContextMenuTriggerState {
  /** Whether the context menu is open. */
  open: boolean;
}

export interface ContextMenuTriggerProps extends BaseUIComponentProps<
  'div',
  ContextMenuTriggerState
> {}

export function ContextMenuTrigger(componentProps: ContextMenuTriggerProps): JSX.Element {
  const contextMenu = useContextMenuRootContextStrict();
  const { store } = useMenuRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  let triggerElement: HTMLElement | null = null;
  let touchPosition: { x: number; y: number } | null = null;
  const longPressTimeout = useTimeout();
  const allowMouseUpTimeout = useTimeout();
  let allowMouseUp = false;
  let mouseUpAbortController: AbortController | null = null;

  function handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent) {
    const isTouchEvent = event.type.startsWith('touch');
    contextMenu.initialCursorPointRef.current = { x, y };
    contextMenu.setAnchor({
      getBoundingClientRect() {
        return DOMRect.fromRect({
          width: isTouchEvent ? 10 : 0,
          height: isTouchEvent ? 10 : 0,
          x,
          y,
        });
      },
    });
    allowMouseUp = false;
    contextMenu.actionsRef.current?.setOpen(
      true,
      createChangeEventDetails(REASONS.triggerPress, event),
    );
    allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
      allowMouseUp = true;
    });
  }

  function handleContextMenu(event: MouseEvent) {
    if (untrack(store.disabled)) {
      return;
    }
    contextMenu.allowMouseUpTriggerRef.current = true;
    stopEvent(event);
    handleLongPress(event.clientX, event.clientY, event);
    const doc = ownerDocument(triggerElement);

    // A listener from an earlier press that never saw its mouseup is dropped; this one is
    // dropped on unmount if its mouseup never arrives.
    mouseUpAbortController?.abort();
    const controller = new AbortController();
    mouseUpAbortController = controller;
    doc.addEventListener(
      'mouseup',
      (mouseEvent) => {
        contextMenu.allowMouseUpTriggerRef.current = false;
        if (!allowMouseUp) {
          return;
        }
        allowMouseUpTimeout.clear();
        allowMouseUp = false;
        const mouseUpTarget = getTarget(mouseEvent) as Element | null;
        if (contains(contextMenu.positionerRef.current, mouseUpTarget)) {
          return;
        }
        if (mouseUpTarget && findRootOwnerId(mouseUpTarget) === contextMenu.rootId) {
          return;
        }
        contextMenu.actionsRef.current?.setOpen(
          false,
          createChangeEventDetails(REASONS.cancelOpen, mouseEvent),
        );
      },
      { once: true, signal: controller.signal },
    );
  }

  function cancelLongPress() {
    longPressTimeout.clear();
    touchPosition = null;
  }

  function handleTouchStart(event: TouchEvent) {
    if (untrack(store.disabled)) {
      cancelLongPress();
      return;
    }
    contextMenu.allowMouseUpTriggerRef.current = false;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    event.stopPropagation();
    const position = { x: touch.clientX, y: touch.clientY };
    touchPosition = position;
    longPressTimeout.start(LONG_PRESS_DELAY, () => {
      // The root may have been disabled while the finger was down.
      if (!untrack(store.disabled)) {
        handleLongPress(position.x, position.y, event);
      }
    });
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    if (longPressTimeout.isStarted() && touchPosition) {
      const deltaX = Math.abs(touch.clientX - touchPosition.x);
      const deltaY = Math.abs(touch.clientY - touchPosition.y);
      if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
        cancelLongPress();
      }
    }
  }

  onCleanup(() => {
    mouseUpAbortController?.abort();
  });

  // The browser's context menu stays closed over the area and over the menu's backdrops.
  // Disabling the root drops a pending long press.
  createEffect(
    () => store.disabled(),
    (disabled) => {
      if (disabled) {
        cancelLongPress();
        return undefined;
      }
      return addEventListener(ownerDocument(triggerElement), 'contextmenu', (event) => {
        const target = getTarget(event) as HTMLElement | null;
        if (
          contains(triggerElement, target) ||
          contains(contextMenu.internalBackdropRef.current, target) ||
          contains(contextMenu.backdropRef.current, target)
        ) {
          event.preventDefault();
        }
      });
    },
  );

  const state: ContextMenuTriggerState = {
    get open() {
      return store.open();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: (el: HTMLElement) => {
      triggerElement = el;
    },
    stateAttributesMapping: pressableTriggerOpenStateMapping,
    props: [
      {
        onContextMenu: handleContextMenu,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: cancelLongPress,
        onTouchCancel: cancelLongPress,
        style: { '-webkit-touch-callout': 'none' },
      },
      elementProps,
    ],
  });
}
