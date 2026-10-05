// Upstream: packages/react/src/toast/createToastManager.ts
//
// A toast manager usable outside the component tree: `add` and `close`
// emit events, and a `Toast.Provider` given the manager (its `toastManager`
// prop) applies them to its toasts. Events emitted while no provider
// listens are dropped. Upstream's `update` and `promise` are left out: an
// `add` with an existing id updates that toast in place.
import type { ToastManagerAddOptions, ToastObject } from './types.ts';
import { generateToastId } from './utils.ts';

export type ToastManagerEvent =
  | { action: 'add'; options: ToastObject<object> }
  | { action: 'close'; options: { id: string | undefined } };

export interface ToastManager<Data extends object = object> {
  /** How a `Toast.Provider` listens; not for callers. */
  ' subscribe': (listener: (event: ToastManagerEvent) => void) => () => void;
  add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
  close: (id?: string) => void;
}

/** Creates a new toast manager. */
export function createToastManager<Data extends object = object>(): ToastManager<Data> {
  const listeners = new Set<(event: ToastManagerEvent) => void>();

  function emit(event: ToastManagerEvent) {
    listeners.forEach((listener) => listener(event));
  }

  return {
    ' subscribe': function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    add(options) {
      const id = options.id || generateToastId();
      emit({
        action: 'add',
        options: { ...options, id, transitionStatus: 'starting' } as ToastObject<object>,
      });
      return id;
    },

    close(id) {
      emit({ action: 'close', options: { id } });
    },
  };
}
