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
// does not activate the item under the pointer. `useMenuItem` is that
// behaviour, which the radio item (`Menu.RadioItem`) shares.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import type { PropsInput } from '../../merge-props/mergeProps.ts';
import type { Mixin } from '../../mix/mix.ts';
import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
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

interface MenuItemParams {
  /** The id the user gave the item, if any. */
  readonly id: string | false | undefined;
  /** The text typeahead matches; the item's text content when not given. */
  readonly label: () => string | undefined;
  /** Whether a press closes the menu. */
  readonly closeOnClick: () => boolean;
}

interface MenuItemBehaviour {
  readonly highlighted: () => boolean;
  /** The item's own props (its id, its tab stop, its presses) and the root's item props. */
  readonly props: ReadonlyArray<PropsInput>;
  /** The button behaviour, merged first, under the item's role and the user's props. */
  readonly button: Mixin<HTMLButtonElement>;
  readonly ref: (el: HTMLElement) => void;
}

/** What makes an element one of a menu's items: its place in the roving focus, its presses, its release after a drag. */
export function useMenuItem(params: MenuItemParams): MenuItemBehaviour {
  const { store, parent, itemProps } = useMenuRootContext();
  // The root decides whether this menu is a context menu's; a menu inside a
  // context menu's trigger is a plain one.
  const contextMenu = parent.type === 'context-menu' ? parent.context : null;
  const listItem = useCompositeListItem({
    get label() {
      return params.label();
    },
  });
  const id = params.id || createUniqueId();
  const highlighted = () => store.isActive(listItem.index());
  let itemElement: HTMLElement | null = null;

  const button = useButton({ native: false, composite: true });

  const ownProps: HTMLProps = {
    id,
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
      if (untrack(params.closeOnClick)) {
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
        // Pressed on the trigger, dragged here and released: a pick.
        // `detail: 1` and a mouse pointer mark it a mouse click, not a keyboard one.
        dispatchClickWithModifiers(itemElement, event, { detail: 1, pointerType: 'mouse' });
      }
    },
  };

  return {
    highlighted,
    props: [ownProps, itemProps],
    button,
    ref: (el: HTMLElement) => {
      itemElement = el;
      listItem.ref(el);
    },
  };
}

export function MenuItem(componentProps: MenuItemProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id', 'label');
  const item = useMenuItem({
    id: untrack(() => componentProps.id),
    label: () => componentProps.label,
    closeOnClick: () => true,
  });

  const state: MenuItemState = {
    get highlighted() {
      return item.highlighted();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    props: [item.button, { role: 'menuitem' }, ...item.props, elementProps],
    ref: item.ref,
  });
}
