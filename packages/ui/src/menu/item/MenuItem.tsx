// Upstream: packages/react/src/menu/item/MenuItem.tsx,
// packages/react/src/menu/item/MenuItemDataAttributes.ts
//
// An item that runs an action: pressing it (or Enter/Space while it is
// highlighted) fires `onClick` and closes the menu (`closeOnClick`).
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import { REGULAR_ITEM, useMenuItem } from './useMenuItem.ts';

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

  const { getItemProps, itemRef } = useMenuItem({
    closeOnClick: () => componentProps.closeOnClick ?? true,
    disabled,
    highlighted,
    id,
    store,
    nativeButton: () => componentProps.nativeButton ?? false,
    nodeId: store.floatingNodeId,
    itemMetadata: REGULAR_ITEM,
  });

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
    props: [itemProps, elementProps, getItemProps],
    ref: (el: HTMLElement) => {
      itemRef(el);
      listItem.ref(el);
    },
  });
}
