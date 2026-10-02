// Upstream: packages/react/src/number-field/scrub-area/NumberFieldScrubAreaContext.ts
//
// What a scrub area shares with its cursor: whether it is scrubbing, with
// touch or with pointer lock refused, and the cell the cursor element is
// kept in so the scrub area can move it.
import { createContext, useContext } from 'solid-js';

export interface NumberFieldScrubAreaContextValue {
  readonly isScrubbing: boolean;
  readonly isTouchInput: boolean;
  readonly isPointerLockDenied: boolean;
  scrubAreaCursorRef: { current: HTMLSpanElement | null };
}

export const NumberFieldScrubAreaContext = createContext<NumberFieldScrubAreaContextValue | null>(
  null,
);

export function useNumberFieldScrubAreaContext(): NumberFieldScrubAreaContextValue {
  const context = useContext(NumberFieldScrubAreaContext);
  if (context === null) {
    throw new Error(
      'Base UI: NumberFieldScrubAreaContext is missing. NumberFieldScrubArea parts must be placed within <NumberField.ScrubArea>.',
    );
  }
  return context;
}
