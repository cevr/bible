// Upstream: packages/react/src/internals/field-root-context/FieldRootContext.ts,
// packages/react/src/internals/labelable-provider/LabelableContext.ts
//
// What a field shares with its label, description, error and control: its
// state (disabled, valid), its name, and the ids that tie them together — the
// control's id (the label's `for`), the label's id (the control's
// `aria-labelledby`) and the ids of the messages that describe the control
// (`aria-describedby`). Upstream keeps the ids in a separate labelable
// context; this port has one field context, since only the field provides
// them. Members that read props are getters.
import { createContext, useContext } from 'solid-js';

import type { FieldRootState } from './FieldRoot.tsx';

export interface FieldRootContextValue {
  readonly state: FieldRootState;
  readonly disabled: boolean;
  /** The name the field's control submits under, when it names none itself. */
  readonly name: string | undefined;
  /** The control's id, which the label points at. */
  readonly controlId: string | undefined;
  setControlId: (id: string | undefined) => void;
  /** The label's id, which names the control. */
  readonly labelId: string | undefined;
  setLabelId: (id: string | undefined) => void;
  /** The ids of the description and error messages that describe the control. */
  readonly messageIds: ReadonlyArray<string>;
  addMessageId: (id: string) => void;
  removeMessageId: (id: string) => void;
}

export const FieldRootContext = createContext<FieldRootContextValue | null>(null);

/** The enclosing field; throws outside one unless `optional`. */
export function useFieldRootContext(): FieldRootContextValue;
export function useFieldRootContext(optional: true): FieldRootContextValue | null;
export function useFieldRootContext(optional = false): FieldRootContextValue | null {
  const context = useContext(FieldRootContext);
  if (context === null && !optional) {
    throw new Error(
      'Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.',
    );
  }
  return context;
}
