// Upstream: packages/react/src/toast/createToastManager.ts
//
// A toast manager usable outside the component tree: `add`, `close`,
// `update` and `promise` emit events, and a `Toast.Provider` given the
// manager (its `toastManager` prop) applies them to its toasts. Events
// emitted while no provider listens are dropped.
import type {
  ToastManagerAddOptions,
  ToastManagerPromiseOptions,
  ToastManagerUpdater,
  ToastObject,
} from './types.ts';
import { generateToastId } from './utils.ts';

export type ToastManagerEvent =
  | { action: 'add'; options: ToastObject<object> }
  | { action: 'close'; options: { id: string | undefined } }
  | { action: 'update'; options: { id: string; updates: ToastManagerUpdater<object> } }
  | {
      action: 'promise';
      options: ToastManagerPromiseOptions<unknown, object> & {
        promise: Promise<unknown>;
        setPromise(promise: Promise<unknown>): void;
      };
    };

export interface ToastManager<Data extends object = object> {
  /** How a `Toast.Provider` listens; not for callers. */
  ' subscribe': (listener: (event: ToastManagerEvent) => void) => () => void;
  add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
  close: (id?: string) => void;
  update: <T extends Data = Data>(id: string, updates: ToastManagerUpdater<T>) => void;
  promise: <Value, T extends Data = Data>(
    promiseValue: Promise<Value>,
    options: ToastManagerPromiseOptions<Value, T>,
  ) => Promise<Value>;
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

    update(id, updates) {
      emit({
        action: 'update',
        options: { id, updates: updates as ToastManagerUpdater<object> },
      });
    },

    promise<Value, T extends Data = Data>(
      promiseValue: Promise<Value>,
      options: ToastManagerPromiseOptions<Value, T>,
    ): Promise<Value> {
      let handledPromise = promiseValue;

      emit({
        action: 'promise',
        options: {
          ...(options as ToastManagerPromiseOptions<unknown, object>),
          promise: promiseValue,
          setPromise(promise: Promise<unknown>) {
            handledPromise = promise as Promise<Value>;
          },
        },
      });

      return handledPromise;
    },
  };
}
