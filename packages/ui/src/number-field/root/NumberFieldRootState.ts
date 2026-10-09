// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx (the state and event types)
//
// The number field's state, which every part renders as `data-*` attributes
// and passes to `class`, `style` and `render`, and the reasons its commit
// callback reports.
import type { BaseUIGenericEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';

export interface NumberFieldRootState {
  /** The value the field shows: its own uncommitted change, else the owner's value. */
  value: number | null;
  /** The text the input shows. */
  inputValue: string;
  /** Whether the component ignores user interaction. */
  disabled: boolean;
  /** Whether the user is scrubbing the value. */
  scrubbing: boolean;
}

type NumberFieldRootCommitEventReason =
  | typeof REASONS.inputBlur
  | typeof REASONS.inputClear
  | typeof REASONS.keyboard
  | typeof REASONS.scrub;

export type NumberFieldRootCommitEventDetails =
  BaseUIGenericEventDetails<NumberFieldRootCommitEventReason>;
