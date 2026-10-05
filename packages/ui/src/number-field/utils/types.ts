// Upstream: packages/react/src/number-field/utils/types.ts
//
// The shapes the number field's parts share: a step's direction and the
// reasons a step may have.
import type { REASONS } from '../../internals/reasons.ts';

export type Direction = -1 | 1;

export type DirectionalChangeReason = typeof REASONS.scrub | typeof REASONS.keyboard;

export interface ChangeEventCustomProperties {
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
