// Upstream: packages/react/src/menu/checkbox-item/MenuCheckboxItem.tsx,
// packages/react/src/menu/checkbox-item/MenuCheckboxItemContext.ts,
// packages/react/src/menu/checkbox-item-indicator/MenuCheckboxItemIndicator.tsx,
// packages/react/src/utils/ItemIndicator.tsx
//
// An item that toggles a setting: `role="menuitemcheckbox"` with
// `aria-checked`, checked or not under the owner's `checked` or its own
// state. It keeps the menu open by default. Its indicator renders while
// checked (and through its exit transition), or always with `keepMounted`.
import type { JSX } from '@solidjs/web';
import { createContext, createUniqueId, omit, untrack, useContext } from 'solid-js';

import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { createUnmountAfterClose, type TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { NOOP } from '../../utils/dom.ts';
import { useControlled } from '../../utils/useControlled.ts';
import { REGULAR_ITEM, useMenuItem } from '../item/useMenuItem.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuChangeEventDetails } from '../store/MenuStore.ts';
import { itemMapping } from '../utils/isKeyboardOpen.ts';

export interface MenuCheckboxItemState {
  disabled: boolean;
  highlighted: boolean;
  checked: boolean;
}

export interface MenuCheckboxItemProps
  extends NativeButtonProps, BaseUIComponentProps<'div', MenuCheckboxItemState> {
  checked?: boolean | undefined;
  /** @default false */
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean, eventDetails: MenuChangeEventDetails) => void) | undefined;
  /** @default false */
  disabled?: boolean | undefined;
  label?: string | undefined;
  /** Whether pressing the item closes the menu. @default false */
  closeOnClick?: boolean | undefined;
}

const MenuCheckboxItemContext = createContext<MenuCheckboxItemState | null>(null);

export function useMenuCheckboxItemContext(): MenuCheckboxItemState {
  const context = useContext(MenuCheckboxItemContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuCheckboxItemContext is missing. MenuCheckboxItem parts must be placed within <Menu.CheckboxItem>.',
    );
  }
  return context;
}

export function MenuCheckboxItem(componentProps: MenuCheckboxItemProps): JSX.Element {
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
    'checked',
    'defaultChecked',
    'onCheckedChange',
  );
  const [checked, setChecked] = useControlled({
    controlled: () => componentProps.checked,
    default: () => componentProps.defaultChecked ?? false,
  });
  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const id = untrack(() => componentProps.id) || createUniqueId();
  const disabled = () => (componentProps.disabled ?? false) || store.disabled();
  const highlighted = () => store.isActive(listItem.index());

  const { getItemProps, itemRef } = useMenuItem({
    closeOnClick: () => componentProps.closeOnClick ?? false,
    disabled,
    highlighted,
    id,
    store,
    nativeButton: () => componentProps.nativeButton ?? false,
    nodeId: store.floatingNodeId,
    itemMetadata: REGULAR_ITEM,
  });

  const state: MenuCheckboxItemState = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
    get checked() {
      return checked();
    },
  };

  // A thunk, built under the providers below so its children read them.
  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      stateAttributesMapping: itemMapping,
      props: [
        itemProps,
        {
          role: 'menuitemcheckbox',
          get 'aria-checked'() {
            return checked() ? 'true' : 'false';
          },
          onClick(event: MouseEvent) {
            const next = !untrack(checked);
            const details = createChangeEventDetails(REASONS.itemPress, event, undefined, {
              preventUnmountOnClose: NOOP,
            });
            untrack(() => componentProps.onCheckedChange)?.(next, details);
            if (!details.isCanceled) {
              setChecked(next);
            }
          },
        },
        elementProps,
        getItemProps,
      ],
      ref: (el: HTMLElement) => {
        itemRef(el);
        listItem.ref(el);
      },
    });

  return <MenuCheckboxItemContext value={state}>{untrack(element)}</MenuCheckboxItemContext>;
}

export interface MenuItemIndicatorState {
  checked: boolean;
  disabled: boolean;
  highlighted: boolean;
  transitionStatus: TransitionStatus;
}

export interface MenuItemIndicatorProps extends BaseUIComponentProps<
  'span',
  MenuItemIndicatorState
> {
  /** Whether the indicator stays in the DOM while unchecked. @default false */
  keepMounted?: boolean | undefined;
}

/** The indicator of a checkbox or radio item, rendered from the item's state. */
export function renderItemIndicator(
  componentProps: MenuItemIndicatorProps,
  item: { checked: boolean; disabled: boolean; highlighted: boolean },
): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'keepMounted');
  let indicator: HTMLElement | null = null;
  const status = createUnmountAfterClose({
    open: () => item.checked,
    element: () => indicator,
  });
  const state: MenuItemIndicatorState = {
    get checked() {
      return item.checked;
    },
    get disabled() {
      return item.disabled;
    },
    get highlighted() {
      return item.highlighted;
    },
    get transitionStatus() {
      return status.transitionStatus();
    },
  };
  return useRenderElement('span', componentProps, {
    state,
    ref: (el: HTMLElement) => {
      indicator = el;
    },
    stateAttributesMapping: itemMapping,
    props: [{ 'aria-hidden': 'true' }, elementProps],
    get enabled() {
      return (componentProps.keepMounted ?? false) || status.mounted();
    },
  });
}

export type MenuCheckboxItemIndicatorState = MenuItemIndicatorState;
export type MenuCheckboxItemIndicatorProps = MenuItemIndicatorProps;

/** Shows whether the checkbox item is checked. Renders a `<span>`. */
export function MenuCheckboxItemIndicator(componentProps: MenuItemIndicatorProps): JSX.Element {
  return renderItemIndicator(componentProps, useMenuCheckboxItemContext());
}
