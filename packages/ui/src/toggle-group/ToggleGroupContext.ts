// Upstream: packages/react/src/toggle-group/ToggleGroupContext.ts
//
// What a toggle reads from the group around it: the owner's pressed values
// (a getter, live) and how to offer a change of them.
import { createContext, useContext } from 'solid-js';

export interface ToggleGroupContextValue<Value> {
  readonly value: readonly Value[];
  /** Offers the owner the value pressing (or releasing) `newValue` makes. */
  setGroupValue: (newValue: Value, nextPressed: boolean) => void;
}

export const ToggleGroupContext = createContext<ToggleGroupContextValue<string> | null>(null);

export function useToggleGroupContext(): ToggleGroupContextValue<string> {
  const context = useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error('Base UI: a <Toggle> must be placed within a <ToggleGroup>.');
  }
  return context;
}
