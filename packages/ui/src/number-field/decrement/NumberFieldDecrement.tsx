// Upstream: packages/react/src/number-field/decrement/NumberFieldDecrement.tsx
//
// A stepper button that decreases the value; held, it repeats. Disabled at `min`.
// Renders a `<button>`.
import type { JSX } from '@solidjs/web';

import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import {
  type StepperButtonProps,
  useNumberFieldStepperButton,
} from '../root/useNumberFieldStepperButton.ts';

export interface NumberFieldDecrementState extends NumberFieldRootState {}

export interface NumberFieldDecrementProps extends StepperButtonProps {}

export function NumberFieldDecrement(componentProps: NumberFieldDecrementProps): JSX.Element {
  return useNumberFieldStepperButton(componentProps, false);
}

export namespace NumberFieldDecrement {
  export type State = NumberFieldDecrementState;
  export type Props = NumberFieldDecrementProps;
}
