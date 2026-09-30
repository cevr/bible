// Scratch a draw rewrites in place: a pose kept at module scope (a house, a
// hand's gesture, an icon count) and written every frame, so the draw
// allocates none. A replay that starts from a known pose resets it in one
// call, so a field added to the pose is reset wherever its defaults are.

/**
 * A pose written in place every frame (a `House`, a `Temple`, a hand's
 * `GestureAt`) with its fields writable, so a scene keeps one at module
 * scope and draws with no allocation.
 */
export type Posed<T> = { -readonly [K in keyof T]: T[K] };

/** Write every field of `defaults` onto `scratch`, in place (no allocation), and hand it back. */
export const reset = <T extends object>(scratch: T, defaults: Readonly<Partial<T>>): T =>
  Object.assign(scratch, defaults);
