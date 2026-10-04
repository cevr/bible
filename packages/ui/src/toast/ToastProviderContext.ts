// Upstream: packages/react/src/toast/provider/ToastProviderContext.ts
//
// The provider's store, and a reactive view of its state: the store is
// plain, so the provider mirrors each change into a signal the parts read
// through `select`.
import { type Accessor, createContext, createMemo, useContext } from 'solid-js';

import type { State, ToastStore } from './store.ts';

export interface ToastContextValue {
  store: ToastStore;
  /** The store's state, as a signal (updates once the change flushes). */
  state: Accessor<State>;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastProviderContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
  }
  return context;
}

/** A memo over one selection of the provider's state. */
export function useToastSelector<T>(
  context: ToastContextValue,
  selector: (state: State) => T,
): Accessor<T> {
  return createMemo(() => selector(context.state()));
}
