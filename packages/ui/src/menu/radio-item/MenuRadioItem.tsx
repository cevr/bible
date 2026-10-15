// Upstream: packages/react/src/menu/radio-item/MenuRadioItem.tsx,
// packages/react/src/menu/radio-item/MenuRadioItemContext.ts,
// packages/react/src/menu/radio-item/MenuRadioItemDataAttributes.ts,
// packages/react/src/menu/utils/stateAttributesMapping.ts
//
// An item of a `Menu.RadioGroup` (`role="menuitemradio"`): checked
// (`aria-checked`, `data-checked`; else `data-unchecked`) while its `value`
// is the group's, and a press offers its value to the group's owner. It is
// an item as `Menu.Item` is (`useMenuItem`: the roving focus, Enter and
// Space, a release after a drag), and keeps the menu open on a press
// unless `closeOnClick`. Upstream's `disabled` and the filter's items are
// left out.
import type { JSX } from '@solidjs/web';
import { createContext, omit, untrack, useContext } from 'solid-js';

import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useMenuItem } from '../item/MenuItem.tsx';
import { useMenuRadioGroupContext } from '../radio-group/MenuRadioGroup.tsx';

interface MenuRadioItemState {
  highlighted: boolean;
  checked: boolean;
}

/** `checked` as `data-checked`, and its absence as `data-unchecked`. */
export const checkedMapping: StateAttributesMapping<{ checked: boolean }> = {
  checked: (value): Record<string, string> =>
    value ? { 'data-checked': '' } : { 'data-unchecked': '' },
};

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

interface MenuRadioItemProps extends BaseUIComponentProps<'div', MenuRadioItemState> {
  /** The value the group holds while this item is checked. */
  value: unknown;
  /** The text typeahead matches; the item's text content when not given. */
  label?: string | undefined;
  /** Whether a press closes the menu. @default false */
  closeOnClick?: boolean | undefined;
}

export function MenuRadioItem(componentProps: MenuRadioItemProps): JSX.Element {
  const group = useMenuRadioGroupContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'id',
    'label',
    'value',
    'closeOnClick',
  );
  const item = useMenuItem({
    id: untrack(() => componentProps.id),
    label: () => componentProps.label,
    closeOnClick: () => componentProps.closeOnClick ?? false,
  });
  const checked = () => group.value() === componentProps.value;

  const state: MenuRadioItemState = {
    get highlighted() {
      return item.highlighted();
    },
    get checked() {
      return checked();
    },
  };

  // A thunk, built under the provider below so its indicator reads it.
  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      stateAttributesMapping: checkedMapping,
      props: [
        item.button,
        {
          role: 'menuitemradio',
          get 'aria-checked'() {
            return checked() ? 'true' : 'false';
          },
          onClick(event: MouseEvent) {
            group.setValue(
              untrack(() => componentProps.value),
              event,
            );
          },
        },
        ...item.props,
        elementProps,
      ],
      ref: item.ref,
    });
  return <MenuRadioItemContext value={state}>{untrack(element)}</MenuRadioItemContext>;
}
