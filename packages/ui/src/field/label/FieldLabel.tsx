// Upstream: packages/react/src/field/label/FieldLabel.tsx
//
// The field's label: its `for` points at the field's control, and its id
// names the control (`aria-labelledby`), so a click on it focuses the
// control and assistive technology reads it as the control's name.
// Upstream's `nativeLabel={false}` (a label rendered as another element) is
// left out.
// Renders a `<label>`.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, onCleanup } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import type { FieldRootState } from '../root/FieldRoot.tsx';
import { useFieldRootContext } from '../root/FieldRootContext.ts';
import { fieldValidityMapping } from '../utils/fieldValidityMapping.ts';

export interface FieldLabelState extends FieldRootState {}

export interface FieldLabelProps extends BaseUIComponentProps<'label', FieldLabelState> {}

export function FieldLabel(componentProps: FieldLabelProps): JSX.Element {
  const field = useFieldRootContext();
  const generatedId = createUniqueId();
  const id = componentProps.id || generatedId;
  field.setLabelId(id);
  onCleanup(() => field.setLabelId(undefined));
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');

  return useRenderElement('label', componentProps, {
    state: field.state,
    props: [
      {
        id,
        get for() {
          return field.controlId;
        },
      },
      elementProps,
    ],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export namespace FieldLabel {
  export type State = FieldLabelState;
  export type Props = FieldLabelProps;
}
