// Upstream: packages/react/src/toggle-group/ToggleGroupContext.ts
//
// What a toggle reads from the group around it: the group's pressed values,
// how to change them, and whether the group is disabled. The values are
// getters, live as the group's state changes.
import { createContext, useContext } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import type { BaseUIEventReasons } from '../internals/reasons.ts';

export interface ToggleGroupContextValue<Value> {
  readonly value: readonly Value[];
  setGroupValue: (
    newValue: Value,
    nextPressed: boolean,
    eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
  ) => void;
  readonly disabled: boolean;
  /** Whether the group was given `value` or `defaultValue` (a toggle then needs a `value`). */
  readonly isValueInitialized: boolean;
}

export const ToggleGroupContext = createContext<ToggleGroupContextValue<string> | null>(null);

export function useToggleGroupContext(): ToggleGroupContextValue<string> | null {
  return useContext(ToggleGroupContext);
}
