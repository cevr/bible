// Upstream: packages/react/src/number-field/increment/NumberFieldIncrement.tsx
//
// A stepper button that increases the value; held, it repeats. Disabled at `max`.
// Renders a `<button>`.
import type { JSX } from '@solidjs/web';

import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import {
  type StepperButtonProps,
  useNumberFieldStepperButton,
} from '../root/useNumberFieldStepperButton.ts';

export interface NumberFieldIncrementState extends NumberFieldRootState {}

export interface NumberFieldIncrementProps extends StepperButtonProps {}

export function NumberFieldIncrement(componentProps: NumberFieldIncrementProps): JSX.Element {
  return useNumberFieldStepperButton(componentProps, true);
}

export namespace NumberFieldIncrement {
  export type State = NumberFieldIncrementState;
  export type Props = NumberFieldIncrementProps;
}
