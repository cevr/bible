// Upstream: packages/react/src/toggle-group/ToggleGroupContext.ts
//
// What a toggle reads from the group around it: the owner's pressed values
// (a getter, live), how to offer a change of them, whether focus is in the
// group, and where to tell it its element and value.
import { createContext, useContext } from 'solid-js';

export interface ToggleGroupContextValue<Value> {
  readonly value: readonly Value[];
  /** Offers the owner the value pressing (or releasing) `newValue` makes. */
  setGroupValue: (newValue: Value, nextPressed: boolean) => void;
  /** Whether focus is in the group (on one of its toggles). */
  holdsFocus: () => boolean;
  /** Tells the group a toggle's element and value (where its tab stop starts). */
  registerToggle: (node: HTMLElement, value: Value) => void;
}

export const ToggleGroupContext = createContext<ToggleGroupContextValue<string> | null>(null);

export function useToggleGroupContext(): ToggleGroupContextValue<string> {
  const context = useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error('Base UI: a <Toggle> must be placed within a <ToggleGroup>.');
  }
  return context;
}
