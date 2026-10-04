// Upstream: packages/react/src/number-field/root/NumberFieldRootDataAttributes.ts
// (the Group, Input, Increment, Decrement, ScrubArea and ScrubAreaCursor
// data attribute modules are identical)
//
// The `data-*` attributes every number field part carries. The Field ones
// (`data-valid`, `data-invalid`, `data-touched`, `data-dirty`, `data-filled`,
// `data-focused`) are left out: this package has no Field.

/** Present while scrubbing. */
export const scrubbing = 'data-scrubbing';
/** Present when the number field is disabled. */
export const disabled = 'data-disabled';
/** Present when the number field is readonly. */
export const readonly = 'data-readonly';
/** Present when the number field is required. */
export const required = 'data-required';
