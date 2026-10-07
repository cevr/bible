// Upstream: packages/react/src/number-field/utils/types.ts
//
// The shapes the number field's parts share: a step's direction, the reasons
// a change or a step may have, and the change the input and scrub area ask
// the root to apply.
import type { REASONS } from '../../internals/reasons.ts';

export type Direction = -1 | 1;

export type DirectionalChangeReason = typeof REASONS.scrub | typeof REASONS.keyboard;

export type ChangeReason =
  | typeof REASONS.inputChange
  | typeof REASONS.inputClear
  | typeof REASONS.inputBlur
  | typeof REASONS.inputPaste
  | DirectionalChangeReason;

/** A change the input or the scrub area asks the root to apply. */
export interface ValueChange {
  reason: ChangeReason;
  event?: Event | undefined;
  /** A step's direction; a value no step produced (typed, pasted, a bound) has none. */
  direction?: Direction | undefined;
}

export interface IncrementValueParameters {
  direction: Direction;
  event?: Event | undefined;
  reason: DirectionalChangeReason;
  /** The value to step from; the field's value when absent. */
  currentValue?: number | null | undefined;
}

/** An event that may carry the modifier keys that pick the step. */
export interface EventWithOptionalKeyState {
  altKey?: boolean | undefined;
  shiftKey?: boolean | undefined;
}

/** The modifier keys of an event that has them (mouse, pointer, keyboard). */
export function getKeyState(event: Event | undefined): EventWithOptionalKeyState {
  if (
    typeof MouseEvent !== 'undefined' &&
    typeof KeyboardEvent !== 'undefined' &&
    (event instanceof MouseEvent || event instanceof KeyboardEvent)
  ) {
    return event;
  }
  return {};
}
