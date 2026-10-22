/**
 * The space a list keeps after its last row, so the row ends clear of the
 * home indicator and of the bar docked under the stack. It comes from the
 * bottom safe-area inset alone, the same with the bar docked or not: the
 * bar lies outside the list's frame, and the list reads none of its state.
 */

/** The room between the last row and the bottom inset, in points. */
export const END_ROOM = 32;

/** The end space for a bottom safe-area inset of `bottom` points. */
export const endSpace = (bottom: number) => Math.max(0, bottom) + END_ROOM;
