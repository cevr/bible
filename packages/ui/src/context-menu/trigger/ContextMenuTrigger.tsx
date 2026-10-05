// Upstream: packages/react/src/context-menu/trigger/ContextMenuTrigger.tsx
//
// The area that opens the context menu: a right click opens it at the
// pointer, and a touch held still for 500ms opens it at the touch (moving
// more than 10px first cancels). The browser's own context menu is
// suppressed over the area and the menu's backdrops. After a right click,
// releasing the button over nothing in the menu more than 500ms later closes
// it again, so a press-drag-release gesture works like a native menu.
// Not in upstream: one owner per press (`claimPress`, `utils/press.ts`). The
// long press also reads the press's pointer moves, since a browser holds
// back the touch's own moves within its slop (wider than 10px) while its
// pointer moves arrive. A consumer's drag that starts claims the press (the
// film lab's `Pointer.drag` does, past `LONG_PRESS_MOVE_THRESHOLD`), and a
// press another holds is no long press, nor opens on the browser's own long
// press `contextmenu`; a long press claims the press as it opens the menu,
// so no drag starts under the open menu. Also not in upstream: the open is
// decided before the browser's menu is prevented. A right click the root's
// `onOpenChange` cancels (a field inside the area keeping its own menu)
// leaves the event alone, so the browser's menu shows; over the area the
// browser's menu is suppressed only by the open that went ahead, and the
// document listener covers the backdrops alone. Nor in upstream: the lift of
// the touch that opened the menu is cancelled, so the browser's click after
// it does not choose the item the menu opened under the finger.
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
import {
  LONG_PRESS_DELAY,
  LONG_PRESS_MOVE_THRESHOLD,
  claimPress,
  pressHeldByOther,
} from '../../utils/press.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useContextMenuRootContextStrict } from '../root/ContextMenuRootContext.ts';

export { LONG_PRESS_DELAY, LONG_PRESS_MOVE_THRESHOLD };

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
  // The touch press's pointer, while one is down on the area, and who the long press claims it as.
  let pressPointer: number | null = null;
  const self = Symbol('context-menu long press');
  const longPressTimeout = useTimeout();
  const allowMouseUpTimeout = useTimeout();
  let allowMouseUp = false;
  // Whether the touch now down opened the menu: its lift then clicks nothing.
  let pressOpened = false;
  let mouseUpAbortController: AbortController | null = null;

  /** Open the menu at `x`, `y`: true when it opened, false when the root's `onOpenChange` cancelled. */
  function handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent): boolean {
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
    const details = createChangeEventDetails(REASONS.triggerPress, event);
    contextMenu.actionsRef.current?.setOpen(true, details);
    if (details.isCanceled) {
      return false;
    }
    // The open menu holds the touch press, so no drag starts under it.
    if (pressPointer !== null) {
      claimPress(pressPointer, self, ownerDocument(triggerElement));
    }
    pressOpened = isTouchEvent;
    allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
      allowMouseUp = true;
    });
    return true;
  }

  function handleContextMenu(event: MouseEvent) {
    if (untrack(store.disabled)) {
      return;
    }
    // The browser's own long press on a touch a drag has taken: its menu stays shut, as ours does.
    if (pressTaken()) {
      stopEvent(event);
      return;
    }
    contextMenu.allowMouseUpTriggerRef.current = true;
    // Declined (a field keeps its own menu): the event is left alone, and the browser's menu shows.
    if (!handleLongPress(event.clientX, event.clientY, event)) {
      contextMenu.allowMouseUpTriggerRef.current = false;
      return;
    }
    stopEvent(event);
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
    pressOpened = false;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    event.stopPropagation();
    const position = { x: touch.clientX, y: touch.clientY };
    touchPosition = position;
    longPressTimeout.start(LONG_PRESS_DELAY, () => {
      // The root may have been disabled while the finger was down, or a drag taken the press.
      if (!untrack(store.disabled) && !pressTaken()) {
        handleLongPress(position.x, position.y, event);
      }
    });
  }

  /** A pending long press whose touch has moved past the threshold to `x`, `y` is cancelled. */
  function cancelIfMoved(x: number, y: number) {
    if (longPressTimeout.isStarted() && touchPosition) {
      const deltaX = Math.abs(x - touchPosition.x);
      const deltaY = Math.abs(y - touchPosition.y);
      if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
        cancelLongPress();
      }
    }
  }

  /**
   * The finger lifts: a pending long press is cancelled, and the lift of the
   * press that opened the menu is spent, so the browser clicks nothing under
   * the finger (the menu opens at the touch, an item under it).
   */
  function handleTouchEnd(event: TouchEvent) {
    cancelLongPress();
    if (pressOpened) {
      pressOpened = false;
      event.preventDefault();
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    cancelIfMoved(touch.clientX, touch.clientY);
  }

  function handlePointerDown(event: PointerEvent) {
    pressPointer = event.pointerType === 'touch' ? event.pointerId : null;
  }

  // The press's pointer moves: a drag that claimed it, or a move past the threshold, ends the long press.
  function handlePointerMove(event: PointerEvent) {
    if (pressPointer === null || event.pointerId !== pressPointer) {
      return;
    }
    if (pressHeldByOther(pressPointer, self)) {
      cancelLongPress();
      return;
    }
    cancelIfMoved(event.clientX, event.clientY);
  }

  /** Whether another (a drag that started) holds the touch press: then the menu does not open on it. */
  function pressTaken(): boolean {
    return pressPointer !== null && pressHeldByOther(pressPointer, self);
  }

  onCleanup(() => {
    mouseUpAbortController?.abort();
  });

  // The browser's context menu stays closed over the menu's backdrops (over the area, the open
  // that went ahead closes it). Disabling the root drops a pending long press.
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
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: cancelLongPress,
        style: { '-webkit-touch-callout': 'none' },
      },
      elementProps,
    ],
  });
}
