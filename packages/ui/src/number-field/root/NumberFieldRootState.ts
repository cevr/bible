// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx (the state and event types)
//
// The number field's state, which every part renders as `data-*` attributes
// and passes to `class`, `style` and `render`, and the reasons its change and
// commit callbacks report.
import type {
  BaseUIChangeEventDetails,
  BaseUIGenericEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';
import type { ChangeEventCustomProperties } from '../utils/types.ts';

export interface NumberFieldRootState {
  /** The raw numeric value of the field. */
  value: number | null;
  /** The text the input shows. */
  inputValue: string;
  /** Whether the user must enter a value before submitting a form. */
  required: boolean;
  /** Whether the component ignores user interaction. */
  disabled: boolean;
  /** Whether the user is unable to change the value. */
  readOnly: boolean;
  /** Whether the user is scrubbing the value. */
  scrubbing: boolean;
}

export type NumberFieldRootChangeEventReason =
  | typeof REASONS.inputChange
  | typeof REASONS.inputClear
  | typeof REASONS.inputBlur
  | typeof REASONS.inputPaste
  | typeof REASONS.keyboard
  | typeof REASONS.incrementPress
  | typeof REASONS.decrementPress
  | typeof REASONS.wheel
  | typeof REASONS.scrub
  | typeof REASONS.none;

export type NumberFieldRootChangeEventDetails = BaseUIChangeEventDetails<
  NumberFieldRootChangeEventReason,
  ChangeEventCustomProperties
>;

export type NumberFieldRootCommitEventReason =
  | typeof REASONS.inputBlur
  | typeof REASONS.inputClear
  | typeof REASONS.keyboard
  | typeof REASONS.incrementPress
  | typeof REASONS.decrementPress
  | typeof REASONS.wheel
  | typeof REASONS.scrub
  | typeof REASONS.none;

export type NumberFieldRootCommitEventDetails =
  BaseUIGenericEventDetails<NumberFieldRootCommitEventReason>;
