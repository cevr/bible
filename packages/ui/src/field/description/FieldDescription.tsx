// Upstream: packages/react/src/field/description/FieldDescription.tsx
//
// A paragraph that says more about the field; the control names it in
// `aria-describedby`.
// Renders a `<p>`.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, onCleanup } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import type { FieldRootState } from '../root/FieldRoot.tsx';
import { useFieldRootContext } from '../root/FieldRootContext.ts';
import { fieldValidityMapping } from '../utils/fieldValidityMapping.ts';

export interface FieldDescriptionState extends FieldRootState {}

export interface FieldDescriptionProps extends BaseUIComponentProps<'p', FieldDescriptionState> {}

export function FieldDescription(componentProps: FieldDescriptionProps): JSX.Element {
  const field = useFieldRootContext();
  const generatedId = createUniqueId();
  const id = componentProps.id || generatedId;
  field.addMessageId(id);
  onCleanup(() => field.removeMessageId(id));
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');

  return useRenderElement('p', componentProps, {
    state: field.state,
    props: [{ id }, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export namespace FieldDescription {
  export type State = FieldDescriptionState;
  export type Props = FieldDescriptionProps;
}
