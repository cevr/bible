// Upstream: packages/react/src/separator/Separator.tsx
//
// A `role="separator"` between groups of items or controls: horizontal (a
// menu's groups) or vertical (a toolbar's), said by `aria-orientation` and
// drawn by `data-orientation`.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';

type Orientation = 'horizontal' | 'vertical';

interface SeparatorState {
  orientation: Orientation;
}

interface SeparatorProps extends BaseUIComponentProps<'div', SeparatorState> {
  /** The separator's orientation. @default 'horizontal' */
  orientation?: Orientation | undefined;
}

export function Separator(componentProps: SeparatorProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'orientation');
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';
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
