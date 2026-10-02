// Upstream: packages/react/src/toast/useToastManager.ts
//
// The toasts of the enclosing `Toast.Provider` and the methods that manage
// them. `toasts` is a live getter: read it in JSX or a tracking scope.
import { createMemo } from 'solid-js';

import type {
  ToastManagerAddOptions,
  ToastManagerPromiseOptions,
  ToastManagerUpdater,
  ToastObject,
} from './types.ts';
import { useToastProviderContext } from './ToastProviderContext.ts';

export interface UseToastManagerReturnValue<Data extends object = object> {
  readonly toasts: ToastObject<Data>[];
  add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
  close: (toastId?: string) => void;
  update: <T extends Data = Data>(toastId: string, options: ToastManagerUpdater<T>) => void;
  promise: <Value, T extends Data = Data>(
    promise: Promise<Value>,
    options: ToastManagerPromiseOptions<Value, T>,
  ) => Promise<Value>;
}

/** Returns the array of toasts and methods to manage them. */
export function useToastManager<Data extends object = object>(): UseToastManagerReturnValue<Data> {
  const { store, state } = useToastProviderContext();
  const toasts = createMemo(() => state().toasts);

  return {
    get toasts() {
      return toasts() as ToastObject<Data>[];
    },
    add: store.addToast,
    close: store.closeToast,
    update: store.updateToast,
    promise: store.promiseToast,
  };
}
