// Upstream: packages/react/src/popover/root/PopoverRootContext.ts
//
// What a popover's parts read from their root: the store and the
// interaction props the root assembled for the triggers and the popup.
import { createContext, useContext } from 'solid-js';

import type { HTMLProps } from '../../internals/types.ts';
import type { PopoverStore } from '../store/PopoverStore.ts';

export interface PopoverRootContext {
  store: PopoverStore;
  /** The props every trigger of the popover carries (dismissal, how it was opened). */
  triggerProps: HTMLProps;
  popupProps: HTMLProps;
}

export const PopoverRootContext = createContext<PopoverRootContext | null>(null);

export function usePopoverRootContext(): PopoverRootContext {
  const context = useContext(PopoverRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: PopoverRootContext is missing. Popover parts must be placed within <Popover.Root>.',
    );
  }
  return context;
}

export function usePopoverRootContextOptional(): PopoverRootContext | null {
  return useContext(PopoverRootContext);
}
