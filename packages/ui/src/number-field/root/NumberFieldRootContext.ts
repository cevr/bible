// Upstream: packages/react/src/number-field/root/NumberFieldRootContext.ts
//
// What the root shares with its parts: the live state, the bounds and step
// amounts, the value setters the input and scrub area call, and
// the bookkeeping that decides when a change is committed. Members that read
// props are getters, so a part reads them live.
import { createContext, useContext } from 'solid-js';

import type {
  NumberFieldRootCommitEventDetails,
  NumberFieldRootState,
} from './NumberFieldRootState.ts';
import type {
  EventWithOptionalKeyState,
  IncrementValueParameters,
  ValueChange,
} from '../utils/types.ts';

export type InputMode = 'numeric' | 'decimal' | 'text';

/** A mutable cell, read and written outside the reactive graph. */
export interface ValueCell<T> {
  current: T;
}

export interface NumberFieldRootContextValue {
  readonly state: NumberFieldRootState;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly inputMode: InputMode;
  readonly locale: Intl.LocalesArgument | undefined;
  readonly format: Intl.NumberFormatOptions | undefined;
  /** Whether typed arithmetic is read on commit (not in upstream). */
  readonly allowExpressions: boolean;
  /** Whether Enter commits typed text (not in upstream). */
  readonly commitOnEnter: boolean;
  /** Validates a value and holds it until its commit; whether it changed. */
  setValue: (value: number | null, change: ValueChange) => boolean;
  /** Steps the value by `amount` in `direction`; an empty field is seeded instead. */
  incrementValue: (amount: number, params: IncrementValueParameters) => boolean;
  /** The step the event's modifiers pick: Alt `smallStep`, Shift `largeStep`, else `step`. */
  getStepAmount: (event?: EventWithOptionalKeyState) => number;
  /** The characters besides digits the input accepts for the locale and format. */
  getAllowedNonNumericKeys: () => Set<string>;
  setInputValue: (text: string) => void;
  setInputElement: (element: HTMLInputElement | null) => void;
  inputElement: () => HTMLInputElement | null;
  /** Focuses the input with the caret at the end. */
  focusInput: () => void;
  setScrubbing: (scrubbing: boolean) => void;
  onValueCommitted: (value: number | null, details: NumberFieldRootCommitEventDetails) => void;
  /** `false` while the input holds text the person typed and has not committed. */
  allowInputSyncRef: ValueCell<boolean>;
  /** The value steps start from: the stored value, or the dirty text just synced. */
  valueRef: ValueCell<number | null>;
  /** The value the last applied change stored. */
  lastChangedValueRef: ValueCell<number | null>;
  /** Whether a change was applied that no commit has reported yet. */
  hasPendingCommit: () => boolean;
}

export const NumberFieldRootContext = createContext<NumberFieldRootContextValue | null>(null);

export function useNumberFieldRootContext(): NumberFieldRootContextValue {
  const context = useContext(NumberFieldRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: NumberFieldRootContext is missing. NumberField parts must be placed within <NumberField.Root>.',
    );
  }
  return context;
}
