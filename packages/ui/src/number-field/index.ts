// Upstream: packages/react/src/number-field/index.ts
export * as NumberField from './index.parts.ts';

export type * from './root/NumberFieldRoot.tsx';
export type * from './root/NumberFieldRootState.ts';
export type * from './group/NumberFieldGroup.tsx';
export type * from './increment/NumberFieldIncrement.tsx';
export type * from './decrement/NumberFieldDecrement.tsx';
export type * from './input/NumberFieldInput.tsx';
export type * from './scrub-area/NumberFieldScrubArea.tsx';
export type * from './scrub-area-cursor/NumberFieldScrubAreaCursor.tsx';

// The parts carry the same attributes; each name is kept as Base UI exports it.
export * as NumberFieldRootDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldGroupDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldIncrementDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldDecrementDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldInputDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldScrubAreaDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldScrubAreaCursorDataAttributes from './root/NumberFieldRootDataAttributes.ts';
