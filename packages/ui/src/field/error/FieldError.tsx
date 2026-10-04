// Upstream: packages/react/src/field/error/FieldError.tsx
//
// The field's error message. It shows while the field is invalid and not
// disabled (or always, with `match`), and while shown the control names it
// in `aria-describedby`. Upstream's matches against native validity keys,
// Form errors and the enter/exit transition states are left out.
// Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import type { FieldRootState } from '../root/FieldRoot.tsx';
import { useFieldRootContext } from '../root/FieldRootContext.ts';
import { fieldValidityMapping } from '../utils/fieldValidityMapping.ts';

export interface FieldErrorState extends FieldRootState {}

export interface FieldErrorProps extends BaseUIComponentProps<'div', FieldErrorState> {
  /** `true` shows the message whatever the field's state. */
  match?: boolean | undefined;
}

export function FieldError(componentProps: FieldErrorProps): JSX.Element {
  const field = useFieldRootContext();
  const generatedId = createUniqueId();
  const id = componentProps.id || generatedId;
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id', 'match');
  const rendered = () =>
    componentProps.match === true || (!field.state.disabled && field.state.valid === false);

  createEffect(rendered, (shown) => {
    if (!shown) {
      return undefined;
    }
    field.addMessageId(id);
    return () => field.removeMessageId(id);
  });

  return useRenderElement('div', componentProps, {
    state: field.state,
    get enabled() {
      return rendered();
    },
    props: [{ id }, elementProps],
    stateAttributesMapping: fieldValidityMapping,
  });
}

export namespace FieldError {
  export type State = FieldErrorState;
  export type Props = FieldErrorProps;
}
