// Upstream: packages/react/src/separator/Separator.tsx
//
// A horizontal `role="separator"` between groups of items.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';

export interface SeparatorState {}

export interface SeparatorProps extends BaseUIComponentProps<'div', SeparatorState> {}

export function Separator(componentProps: SeparatorProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  return useRenderElement('div', componentProps, {
    state: {},
    props: [{ role: 'separator' }, elementProps],
  });
}
