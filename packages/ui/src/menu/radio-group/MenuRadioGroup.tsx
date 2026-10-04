// Upstream: packages/react/src/menu/radio-group/MenuRadioGroup.tsx,
// packages/react/src/menu/radio-group/MenuRadioGroupContext.ts,
// packages/react/src/menu/radio-item/MenuRadioItem.tsx,
// packages/react/src/menu/radio-item/MenuRadioItemContext.ts,
// packages/react/src/menu/radio-item-indicator/MenuRadioItemIndicator.tsx
//
// A group of `menuitemradio` items of which one is checked: the group holds
// the value (the owner's `value` or its own), an item checks itself by
// setting its `value`. Items keep the menu open by default.
import type { JSX } from '@solidjs/web';
import { createContext, createUniqueId, omit, untrack, useContext } from 'solid-js';

import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { NOOP } from '../../utils/dom.ts';
import { useControlled } from '../../utils/useControlled.ts';
import {
  type MenuItemIndicatorProps,
  type MenuItemIndicatorState,
  renderItemIndicator,
} from '../checkbox-item/MenuCheckboxItem.tsx';
import { createGroupLabelId, MenuGroupContext } from '../group/MenuGroup.tsx';
import { REGULAR_ITEM, useMenuItem } from '../item/useMenuItem.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuChangeEventDetails } from '../store/MenuStore.ts';
import { itemMapping } from '../utils/isKeyboardOpen.ts';

interface MenuRadioGroupContextValue {
  value: () => unknown;
  setValue: (value: unknown, details: MenuChangeEventDetails) => void;
  disabled: () => boolean;
}

const MenuRadioGroupContext = createContext<MenuRadioGroupContextValue | null>(null);

function useMenuRadioGroupContext(): MenuRadioGroupContextValue {
  const context = useContext(MenuRadioGroupContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuRadioGroupContext is missing. MenuRadioGroup parts must be placed within <Menu.RadioGroup>.',
    );
  }
  return context;
}

export interface MenuRadioGroupState {
  disabled: boolean;
}

export interface MenuRadioGroupProps extends BaseUIComponentProps<'div', MenuRadioGroupState> {
  value?: unknown;
  defaultValue?: unknown;
  onValueChange?: ((value: unknown, eventDetails: MenuChangeEventDetails) => void) | undefined;
  /** @default false */
  disabled?: boolean | undefined;
}

export function MenuRadioGroup(componentProps: MenuRadioGroupProps): JSX.Element {
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'value',
    'defaultValue',
    'onValueChange',
    'disabled',
    'aria-labelledby',
  );
  const { labelId, update } = createGroupLabelId();
  const [value, setOwnValue] = useControlled<unknown>({
    controlled: () => componentProps.value,
    default: () => componentProps.defaultValue,
  });
  const disabled = () => componentProps.disabled ?? false;

  const context: MenuRadioGroupContextValue = {
    value,
    setValue(next, details) {
      untrack(() => componentProps.onValueChange)?.(next, details);
      if (!details.isCanceled) {
        setOwnValue(next);
      }
    },
    disabled,
  };

  const state: MenuRadioGroupState = {
    get disabled() {
      return disabled();
    },
  };

  // A thunk, built under the providers below so its children read them.
  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      props: [
        {
          role: 'group',
          get 'aria-labelledby'() {
            return componentProps['aria-labelledby'] ?? labelId();
          },
          get 'aria-disabled'() {
            return disabled() ? 'true' : undefined;
          },
        },
        elementProps,
      ],
    });

  return (
    <MenuGroupContext value={update}>
      <MenuRadioGroupContext value={context}>{untrack(element)}</MenuRadioGroupContext>
    </MenuGroupContext>
  );
}

export interface MenuRadioItemState {
  disabled: boolean;
  highlighted: boolean;
  checked: boolean;
}

export interface MenuRadioItemProps
  extends NativeButtonProps, BaseUIComponentProps<'div', MenuRadioItemState> {
  /** The value the group takes when this item is checked. */
  value: unknown;
  /** @default false */
  disabled?: boolean | undefined;
  label?: string | undefined;
  /** Whether pressing the item closes the menu. @default false */
  closeOnClick?: boolean | undefined;
}

const MenuRadioItemContext = createContext<MenuRadioItemState | null>(null);

export function useMenuRadioItemContext(): MenuRadioItemState {
  const context = useContext(MenuRadioItemContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuRadioItemContext is missing. MenuRadioItem parts must be placed within <Menu.RadioItem>.',
    );
  }
  return context;
}

export function MenuRadioItem(componentProps: MenuRadioItemProps): JSX.Element {
  const { store, itemProps } = useMenuRootContext();
  const group = useMenuRadioGroupContext();
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
    'value',
  );
  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const id = untrack(() => componentProps.id) || createUniqueId();
  const disabled = () => (componentProps.disabled ?? false) || group.disabled() || store.disabled();
  const highlighted = () => store.isActive(listItem.index());
  const checked = () => group.value() === componentProps.value;

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

  const state: MenuRadioItemState = {
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
          role: 'menuitemradio',
          get 'aria-checked'() {
            return checked() ? 'true' : 'false';
          },
          onClick(event: MouseEvent) {
            const details = createChangeEventDetails(REASONS.itemPress, event, undefined, {
              preventUnmountOnClose: NOOP,
            });
            group.setValue(
              untrack(() => componentProps.value),
              details,
            );
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

  return <MenuRadioItemContext value={state}>{untrack(element)}</MenuRadioItemContext>;
}

export type MenuRadioItemIndicatorState = MenuItemIndicatorState;
export type MenuRadioItemIndicatorProps = MenuItemIndicatorProps;

/** Shows whether the radio item is checked. Renders a `<span>`. */
export function MenuRadioItemIndicator(componentProps: MenuItemIndicatorProps): JSX.Element {
  return renderItemIndicator(componentProps, useMenuRadioItemContext());
}
