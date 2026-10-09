/**
 * A state as an ARIA attribute says it (`aria-pressed`, `aria-busy`, a
 * `data-*` flag). A function, not an inline template: it types the value as
 * `'true' | 'false'`.
 */
export const pressed = (on: boolean) => `${on}` as const;
