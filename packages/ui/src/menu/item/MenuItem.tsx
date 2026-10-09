// Upstream: packages/react/src/menu/item/MenuItem.tsx,
// packages/react/src/menu/item/MenuItemDataAttributes.ts,
// packages/react/src/menu/item/useMenuItem.ts,
// packages/react/src/menu/item/useMenuItemCommonProps.ts
//
// An item that runs an action: pressing it (or Enter/Space while it is
// highlighted) fires `onClick` and closes the menu. It is a `menuitem` in
// the roving tab order (the highlighted one is tabbable), and releasing the
// mouse on it after pressing the trigger (press, drag, release) activates
// it. In a context menu, the release of the right-click that opened the menu
// does not activate the item under the pointer.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { dispatchClickWithModifiers, useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { platform } from '../../utils/platform.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

interface MenuItemState {
  highlighted: boolean;
}

interface MenuItemProps extends BaseUIComponentProps<'div', MenuItemState> {
  /** The text typeahead matches; the item's text content when not given. */
  label?: string | undefined;
}

export function MenuItem(componentProps: MenuItemProps): JSX.Element {
  const { store, parent, itemProps } = useMenuRootContext();
  // The root decides whether this menu is a context menu's; a menu inside a
  // context menu's trigger is a plain one.
  const contextMenu = parent.type === 'context-menu' ? parent.context : null;
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id', 'label');
  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const id = untrack(() => componentProps.id) || createUniqueId();
  const highlighted = () => store.isActive(listItem.index());
  let itemElement: HTMLElement | null = null;

  const { getButtonProps } = useButton({ native: false, composite: true });

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
      store.setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
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
        // Pressed on the trigger, dragged here and released: a pick.
        // `detail: 1` and a mouse pointer mark it a mouse click, not a keyboard one.
        dispatchClickWithModifiers(itemElement, event, { detail: 1, pointerType: 'mouse' });
      }
    },
  };

  const state: MenuItemState = {
    get highlighted() {
      return highlighted();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    props: [ownProps, itemProps, elementProps, getButtonProps],
    ref: (el: HTMLElement) => {
      itemElement = el;
      listItem.ref(el);
    },
  });
}
