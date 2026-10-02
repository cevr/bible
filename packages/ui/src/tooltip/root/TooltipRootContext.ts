// Upstream: packages/react/src/tooltip/root/TooltipRootContext.ts
//
// What a tooltip's parts read from their root: the store and the
// interaction props the root assembled for the trigger and the popup.
import { createContext, useContext } from 'solid-js';

import type { HTMLProps } from '../../internals/types.ts';
import type { TooltipStore } from '../store/TooltipStore.ts';

export interface TooltipRootContext {
  store: TooltipStore;
  /** The props the trigger carries (a press on it closes the tooltip). */
  triggerProps: HTMLProps;
  popupProps: HTMLProps;
}

export const TooltipRootContext = createContext<TooltipRootContext | null>(null);

export function useTooltipRootContext(): TooltipRootContext {
  const context = useContext(TooltipRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: TooltipRootContext is missing. Tooltip parts must be placed within <Tooltip.Root>.',
    );
  }
  return context;
}
