// Upstream: packages/react/src/menu/item/useMenuItem.ts,
// packages/react/src/menu/item/useMenuItemCommonProps.ts
//
// What every menu item does: it is a `menuitem` in the roving tab order (the
// highlighted one is tabbable), a click closes the menu unless the item says
// otherwise, hovering it tells the tree so an unrelated open submenu closes,
// and releasing the mouse on it after pressing the trigger (press, drag,
// release) activates it. A disabled item stays focusable so the arrow keys
// still reach it. In a context menu, the release of the right-click that
// opened the menu does not activate the item under the pointer.
import { untrack } from 'solid-js';

import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { dispatchClickWithModifiers, useButton } from '../../internals/useButton.ts';
import { mergeProps } from '../../merge-props/mergeProps.ts';
import { platform } from '../../utils/platform.ts';
import type { ItemHoverEvent } from '../positioner/MenuPositioner.tsx';
import type { MenuStore } from '../store/MenuStore.ts';

export const REGULAR_ITEM = { type: 'regular-item' as const };

export type UseMenuItemMetadata =
  | typeof REGULAR_ITEM
  | { type: 'submenu-trigger'; setActive: (event: MouseEvent) => void };

export interface UseMenuItemParameters {
  closeOnClick: () => boolean;
  disabled: () => boolean;
  highlighted: () => boolean;
  id: string | undefined;
  /** Whether the item renders a native `<button>`. */
  nativeButton: () => boolean;
  itemMetadata: UseMenuItemMetadata;
  /** The tree node of the menu the item is in. */
  nodeId: string | undefined;
  store: MenuStore;
  typingRef?: { current: boolean } | undefined;
}

export interface UseMenuItemReturnValue {
  getItemProps: (externalProps?: HTMLProps) => HTMLProps;
  itemRef: (element: HTMLElement | null) => void;
}

export interface UseMenuItemCommonPropsParameters {
  closeOnClick: () => boolean;
  highlighted: () => boolean;
  id: string | undefined;
  nodeId: string | undefined;
  store: MenuStore;
  typingRef?: { current: boolean } | undefined;
  itemElement: () => HTMLElement | null;
  itemMetadata: UseMenuItemMetadata;
}

export function useMenuItemCommonProps(params: UseMenuItemCommonPropsParameters): HTMLProps {
  const { store, nodeId, itemMetadata } = params;
  const contextMenuContext = useContextMenuRootContext();
  const isContextMenu = contextMenuContext !== null;
  const typingRef = params.typingRef ?? store.typingRef;
  const menuEvents = store.floatingTreeRoot.events;

  return {
    id: params.id,
    role: 'menuitem',
    // `-1` rather than none, which would leave links and buttons in the tab order.
    get tabindex() {
      return store.open() && params.highlighted() ? 0 : -1;
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === ' ' && typingRef.current) {
        event.preventDefault();
      }
    },
    onMouseMove(event: MouseEvent) {
      if (!nodeId) {
        return;
      }
      const hover: ItemHoverEvent = { nodeId, target: event.currentTarget as Element };
      menuEvents.emit('itemhover', hover);
    },
    onClick(event: MouseEvent) {
      if (untrack(params.closeOnClick)) {
        menuEvents.emit('close', { domEvent: event, reason: REASONS.itemPress });
      }
    },
    onMouseUp(event: MouseEvent) {
      if (contextMenuContext) {
        const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
        contextMenuContext.initialCursorPointRef.current = null;
        if (
          initialCursorPoint &&
          Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
          Math.abs(event.clientY - initialCursorPoint.y) <= 1
        ) {
          return;
        }
        // Off macOS, this mouseup ends the right-click that opened the menu.
        if (!platform.os.mac && event.button === 2) {
          return;
        }
      }
      const item = params.itemElement();
      if (item && store.allowMouseUpTriggerRef.current && (!isContextMenu || event.button === 2)) {
        // Pressed on the trigger, dragged here and released: a pick, which always closes.
        if (itemMetadata.type === 'regular-item') {
          // `detail: 1` and a mouse pointer mark it a mouse click, not a keyboard one.
          dispatchClickWithModifiers(item, event, { detail: 1, pointerType: 'mouse' });
        }
      }
    },
  };
}

export function useMenuItem(params: UseMenuItemParameters): UseMenuItemReturnValue {
  let itemElement: HTMLElement | null = null;
  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return params.disabled();
    },
    focusableWhenDisabled: true,
    get native() {
      return params.nativeButton();
    },
    composite: true,
  });

  const commonProps = useMenuItemCommonProps({
    closeOnClick: params.closeOnClick,
    highlighted: params.highlighted,
    id: params.id,
    nodeId: params.nodeId,
    store: params.store,
    typingRef: params.typingRef,
    itemElement: () => itemElement,
    itemMetadata: params.itemMetadata,
  });

  const metadata = params.itemMetadata;
  const hoverProps: HTMLProps =
    metadata.type === 'submenu-trigger'
      ? {
          onMouseEnter(event: MouseEvent) {
            metadata.setActive(event);
          },
        }
      : {};

  return {
    getItemProps: (externalProps = {}) =>
      mergeProps(commonProps, hoverProps, externalProps, getButtonProps),
    itemRef(element) {
      itemElement = element;
      buttonRef(element);
    },
  };
}
