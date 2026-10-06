// Upstream: packages/react/src/menu/item/MenuItem.tsx,
// packages/react/src/menu/item/MenuItemDataAttributes.ts,
// packages/react/src/menu/item/useMenuItem.ts,
// packages/react/src/menu/item/useMenuItemCommonProps.ts
//
// An item that runs an action: pressing it (or Enter/Space while it is
// highlighted) fires `onClick` and closes the menu (`closeOnClick`). It is a
// `menuitem` in the roving tab order (the highlighted one is tabbable), and
// releasing the mouse on it after pressing the trigger (press, drag, release)
// activates it. A disabled item stays focusable so the arrow keys still reach
// it. In a context menu, the release of the right-click that opened the menu
// does not activate the item under the pointer.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { dispatchClickWithModifiers, useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { platform } from '../../utils/platform.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

export interface MenuItemState {
  disabled: boolean;
  highlighted: boolean;
}

export interface MenuItemProps
  extends NativeButtonProps, BaseUIComponentProps<'div', MenuItemState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** The text typeahead matches; the item's text content when not given. */
  label?: string | undefined;
  /** Whether pressing the item closes the menu. @default true */
  closeOnClick?: boolean | undefined;
}

export function MenuItem(componentProps: MenuItemProps): JSX.Element {
  const { store, itemProps } = useMenuRootContext();
  const contextMenu = useContextMenuRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'id',
    'label',
    'nativeButton',
    'disabled',
    'closeOnClick',
  );
  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const id = untrack(() => componentProps.id) || createUniqueId();
  const disabled = () => (componentProps.disabled ?? false) || store.disabled();
  const highlighted = () => store.isActive(listItem.index());
  let itemElement: HTMLElement | null = null;

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    focusableWhenDisabled: true,
    get native() {
      return componentProps.nativeButton ?? false;
    },
    composite: true,
  });

  const ownProps = {
    id,
    role: 'menuitem',
    // `-1` rather than none, which would leave links and buttons in the tab order.
    get tabindex() {
      return store.open() && highlighted() ? 0 : -1;
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === ' ' && store.typingRef.current) {
        event.preventDefault();
      }
    },
    onClick(event: MouseEvent) {
      if (untrack(() => componentProps.closeOnClick ?? true)) {
        store.setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
      }
    },
    onMouseUp(event: MouseEvent) {
      if (contextMenu) {
        const initialCursorPoint = contextMenu.initialCursorPointRef.current;
        contextMenu.initialCursorPointRef.current = null;
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
      if (
        itemElement &&
        store.allowMouseUpTriggerRef.current &&
        (contextMenu === null || event.button === 2)
      ) {
        // Pressed on the trigger, dragged here and released: a pick, which always closes.
        // `detail: 1` and a mouse pointer mark it a mouse click, not a keyboard one.
        dispatchClickWithModifiers(itemElement, event, { detail: 1, pointerType: 'mouse' });
      }
    },
  };

  const state: MenuItemState = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    props: [ownProps, itemProps, elementProps, getButtonProps],
    ref: (el: HTMLElement) => {
      itemElement = el;
      buttonRef(el);
      listItem.ref(el);
    },
  });
}
