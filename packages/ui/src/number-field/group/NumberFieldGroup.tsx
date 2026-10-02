// Upstream: packages/react/src/number-field/group/NumberFieldGroup.tsx
//
// Groups the input with the increment and decrement buttons (`role="group"`).
// Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext.ts';
import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';

export interface NumberFieldGroupState extends NumberFieldRootState {}

export interface NumberFieldGroupProps extends BaseUIComponentProps<'div', NumberFieldGroupState> {}

export function NumberFieldGroup(componentProps: NumberFieldGroupProps): JSX.Element {
  const { state } = useNumberFieldRootContext();
  return useRenderElement('div', componentProps, {
    state,
    props: [{ role: 'group' }, omit(componentProps, 'class', 'style', 'render')],
    stateAttributesMapping,
  });
}

export namespace NumberFieldGroup {
  export type State = NumberFieldGroupState;
  export type Props = NumberFieldGroupProps;
}
