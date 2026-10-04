// Upstream: packages/react/src/field/root/FieldRoot.tsx
//
// Groups a control with its label, description and error, and ties them
// together: the label names the control and points at it, the description
// and a shown error describe it, and the field's `disabled` disables it. A
// field is invalid when its owner says so (`invalid`); the state shows as
// `data-invalid` (and `data-disabled`) on every part.
//
// Ported in part: upstream's native constraint validation (`validate`,
// `validationMode`, the validity state), Form errors, Field.Control,
// Field.Item, Field.Validity and the touched/dirty/filled/focused states are
// left out; this package has no Form, and its controls (NumberField) report
// their own values. The owner validates and passes `invalid`.
// Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { createSignal, omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { fieldValidityMapping } from '../utils/fieldValidityMapping.ts';
import { FieldRootContext, type FieldRootContextValue } from './FieldRootContext.ts';

export interface FieldRootState {
  /** Whether the field ignores user interaction. */
  disabled: boolean;
  /** `false` when the field is invalid; `null` when nothing says it is. */
  valid: boolean | null;
}

export interface FieldRootProps extends BaseUIComponentProps<'div', FieldRootState> {
  /** Whether the field and its control ignore user interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether the field is invalid: its error shows and its control is `aria-invalid`. @default false */
  invalid?: boolean | undefined;
  /** The name the control submits under, when it names none itself. */
  name?: string | undefined;
}

export function FieldRoot(props: FieldRootProps): JSX.Element {
  const [controlId, setControlId] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });
  const [labelId, setLabelId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [messageIds, setMessageIds] = createSignal<ReadonlyArray<string>>([], {
    ownedWrite: true,
  });
  const elementProps = omit(props, 'class', 'style', 'render', 'disabled', 'invalid', 'name');

  const state: FieldRootState = {
    get disabled() {
      return props.disabled ?? false;
    },
    get valid() {
      return props.invalid ? false : null;
    },
  };

  const context: FieldRootContextValue = {
    state,
    get disabled() {
      return props.disabled ?? false;
    },
    get name() {
      return props.name;
    },
    get controlId() {
      return controlId();
    },
    setControlId: (id) => setControlId(() => id),
    get labelId() {
      return labelId();
    },
    setLabelId: (id) => setLabelId(() => id),
    get messageIds() {
      return messageIds();
    },
    addMessageId: (id) => setMessageIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
    removeMessageId: (id) => setMessageIds((ids) => ids.filter((item) => item !== id)),
  };

  // Rendered inside the provider, so the parts among its children find the context.
  function RootElement() {
    return useRenderElement('div', props, {
      state,
      props: [elementProps],
      stateAttributesMapping: fieldValidityMapping,
    });
  }

  return (
    <FieldRootContext value={context}>
      <RootElement />
    </FieldRootContext>
  );
}

export namespace FieldRoot {
  export type State = FieldRootState;
  export type Props = FieldRootProps;
}
