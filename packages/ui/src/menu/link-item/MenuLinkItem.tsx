// Upstream: packages/react/src/menu/link-item/MenuLinkItem.tsx
//
// An item that navigates: an `<a>` in the menu's list. Enter follows the
// link; it keeps the menu open unless `closeOnClick`.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { mergeProps } from '../../merge-props/mergeProps.ts';
import { REGULAR_ITEM, useMenuItemCommonProps } from '../item/useMenuItem.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

export interface MenuLinkItemState {
  highlighted: boolean;
}

export interface MenuLinkItemProps extends BaseUIComponentProps<'a', MenuLinkItemState> {
  label?: string | undefined;
  /** Whether following the link closes the menu. @default false */
  closeOnClick?: boolean | undefined;
}

export function MenuLinkItem(componentProps: MenuLinkItemProps): JSX.Element {
  const { store, itemProps } = useMenuRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'id',
    'label',
    'closeOnClick',
  );
  let linkElement: HTMLElement | null = null;
  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const id = untrack(() => componentProps.id) || createUniqueId();
  const highlighted = () => store.isActive(listItem.index());

  const { getButtonProps, buttonRef } = useButton({ native: false, composite: true });
  const commonProps = useMenuItemCommonProps({
    closeOnClick: () => componentProps.closeOnClick ?? false,
    highlighted,
    id,
    nodeId: store.floatingNodeId,
    store,
    itemElement: () => linkElement,
    itemMetadata: REGULAR_ITEM,
  });

  const getItemProps = (externalProps: HTMLProps = {}) =>
    mergeProps(commonProps, externalProps, getButtonProps);

  const state: MenuLinkItemState = {
    get highlighted() {
      return highlighted();
    },
  };

  return useRenderElement('a', componentProps, {
    state,
    props: [itemProps, elementProps, getItemProps],
    ref: (el: HTMLElement) => {
      linkElement = el;
      buttonRef(el);
      listItem.ref(el);
    },
  });
}
