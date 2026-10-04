// Upstream: packages/react/src/toolbar/root/ToolbarRootContext.ts,
// packages/react/src/toolbar/group/ToolbarGroupContext.ts
//
// What a toolbar's parts read from the toolbar (its orientation and whether
// it is disabled) and from the group around them (whether it is disabled).
// The values are getters, live as the props behind them change.
import { createContext, useContext } from 'solid-js';

import type { Orientation } from '../internals/types.ts';

export interface ToolbarRootContextValue {
  readonly disabled: boolean;
  readonly orientation: Orientation;
}

export const ToolbarRootContext = createContext<ToolbarRootContextValue | null>(null);

/** The enclosing toolbar; throws outside one unless `optional`. */
export function useToolbarRootContext(): ToolbarRootContextValue;
export function useToolbarRootContext(optional: true): ToolbarRootContextValue | null;
export function useToolbarRootContext(optional = false): ToolbarRootContextValue | null {
  const context = useContext(ToolbarRootContext);
  if (context === null && !optional) {
    throw new Error(
      'Base UI: ToolbarRootContext is missing. Toolbar parts must be placed within <Toolbar.Root>.',
    );
  }
  return context;
}

export interface ToolbarGroupContextValue {
  readonly disabled: boolean;
}

export const ToolbarGroupContext = createContext<ToolbarGroupContextValue | null>(null);

export function useToolbarGroupContext(): ToolbarGroupContextValue | null {
  return useContext(ToolbarGroupContext);
}

/** What a toolbar item tells the toolbar: a disabled, unfocusable item leaves the roving focus. */
export interface ToolbarItemMetadata {
  disabled: boolean;
  focusableWhenDisabled: boolean;
}
