// Upstream: packages/react/src/toast/useToastManager.ts
//
// The toasts of the enclosing `Toast.Provider`. `toasts` is a live getter:
// read it in JSX or a tracking scope. Upstream's `add` and `close` members
// are left out: toasts are added and closed through a `createToastManager`.
import { createMemo } from 'solid-js';

import type { ToastObject } from './types.ts';
import { useToastProviderContext } from './ToastProviderContext.ts';

interface UseToastManagerReturnValue<Data extends object = object> {
  readonly toasts: ToastObject<Data>[];
}

/** Returns the array of toasts. */
export function useToastManager<Data extends object = object>(): UseToastManagerReturnValue<Data> {
  const { state } = useToastProviderContext();
  const toasts = createMemo(() => state().toasts);

  return {
    get toasts() {
      return toasts() as ToastObject<Data>[];
    },
  };
}
