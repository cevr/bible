// Upstream: packages/react/src/number-field/index.ts
export * as NumberField from './index.parts.ts';

export type * from './root/NumberFieldRoot.tsx';
export type * from './root/NumberFieldRootState.ts';
export type * from './input/NumberFieldInput.tsx';
export type * from './scrub-area/NumberFieldScrubArea.tsx';

// The parts carry the same attributes; each name is kept as Base UI exports it.
export * as NumberFieldRootDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldInputDataAttributes from './root/NumberFieldRootDataAttributes.ts';
export * as NumberFieldScrubAreaDataAttributes from './root/NumberFieldRootDataAttributes.ts';
