// Upstream: packages/react/src/number-field/utils/stateAttributesMapping.ts
//
// The value and the input's text stay out of the `data-*` attributes.
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';

export const stateAttributesMapping: StateAttributesMapping<NumberFieldRootState> = {
  inputValue: () => null,
  value: () => null,
};
