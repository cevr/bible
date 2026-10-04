// Upstream: packages/react/src/internals/field-constants/constants.ts (fieldValidityMapping)
//
// A field's `valid` state as attributes: `data-valid` when it is valid,
// `data-invalid` when it is not, nothing when nothing says either.

export const fieldValidityMapping = {
  valid(value: boolean | null): Record<string, string> | null {
    if (value === null) {
      return null;
    }
    return value ? { 'data-valid': '' } : { 'data-invalid': '' };
  },
};
