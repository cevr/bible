// Upstream: packages/react/src/toast/root/ToastRootContext.ts
//
// What a toast's parts read of their root: the toast, where to register
// the title's id, whether the stack is expanded, the toast's visible index,
// and how to re-measure its height.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { ToastObject } from './types.ts';

export interface ToastRootContextValue {
  toast: Accessor<ToastObject<object>>;
  setTitleId: (updater: (current: string | undefined) => string | undefined) => void;
  visibleIndex: Accessor<number>;
  expanded: Accessor<boolean>;
  recalculateHeight: () => void;
}

export const ToastRootContext = createContext<ToastRootContextValue | null>(null);

export function useToastRootContext(): ToastRootContextValue {
  const context = useContext(ToastRootContext);
  if (!context) {
    throw new Error(
      'Base UI: ToastRootContext is missing. Toast parts must be used within <Toast.Root>.',
    );
  }
  return context;
}
