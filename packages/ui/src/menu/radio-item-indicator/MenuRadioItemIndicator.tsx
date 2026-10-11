// Upstream: packages/react/src/menu/radio-item-indicator/MenuRadioItemIndicator.tsx
//
// What shows a radio item checked (a check mark, a dot): rendered only
// while its item is checked, unless `keepMounted`; hidden from assistive
// tech, which reads the item's `aria-checked`. Upstream's exit transition
// is left out.
import { type JSX, Show } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { checkedMapping, useMenuRadioItemContext } from '../radio-item/MenuRadioItem.tsx';

interface MenuRadioItemIndicatorState {
  checked: boolean;
  highlighted: boolean;
}

interface MenuRadioItemIndicatorProps extends BaseUIComponentProps<
  'span',
  MenuRadioItemIndicatorState
> {
  /** Whether the indicator stays in the DOM while its item is unchecked. @default false */
  keepMounted?: boolean | undefined;
}

export function MenuRadioItemIndicator(componentProps: MenuRadioItemIndicatorProps): JSX.Element {
  const item = useMenuRadioItemContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'keepMounted');
  return (
    <Show when={componentProps.keepMounted === true || item.checked}>
      {useRenderElement('span', componentProps, {
        state: item,
        stateAttributesMapping: checkedMapping,
        props: [{ 'aria-hidden': 'true' }, elementProps],
      })}
    </Show>
  );
}
