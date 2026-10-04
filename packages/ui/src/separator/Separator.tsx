// Upstream: packages/react/src/separator/Separator.tsx,
// packages/react/src/separator/SeparatorDataAttributes.ts
//
// A `role="separator"` between groups of items, horizontal unless told
// otherwise (`data-orientation`).
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps, Orientation } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';

export interface SeparatorState {
  orientation: Orientation;
}

export interface SeparatorProps extends BaseUIComponentProps<'div', SeparatorState> {
  /** @default 'horizontal' */
  orientation?: Orientation | undefined;
}

export function Separator(componentProps: SeparatorProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'orientation');
  const orientation = () => componentProps.orientation ?? 'horizontal';
  const state: SeparatorState = {
    get orientation() {
      return orientation();
    },
  };
  return useRenderElement('div', componentProps, {
    state,
    props: [
      {
        role: 'separator',
        get 'aria-orientation'() {
          return orientation();
        },
      },
      elementProps,
    ],
  });
}
