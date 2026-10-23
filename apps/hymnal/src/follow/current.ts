/**
 * The sung line's state for the web: `aria-current`, which react-native-web
 * passes through and React writes as `"true"` or `"false"`. On iOS and
 * Android the line is `selected` (`aria-selected`) and this adds nothing
 * (`current.native.ts`).
 */
export const currentOf = (on: boolean) => ({ 'aria-current': on });
