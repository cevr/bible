// Upstream: packages/react/src/toast/provider/ToastProvider.tsx
//
// Owns the toasts of the parts inside it: a store created once, kept in
// step with the `timeout` and `limit` props, and fed by a `toastManager`
// created outside the tree when one is given.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';

import type { ToastManager } from './createToastManager.ts';
import { ToastStore } from './store.ts';
import { ToastContext, type ToastContextValue } from './ToastProviderContext.ts';

export interface ToastProviderState {}

export interface ToastProviderProps {
  children?: JSX.Element;
  /**
   * The default amount of time (in ms) before a toast is auto dismissed.
   * A value of `0` will prevent the toast from being dismissed automatically.
   * @default 5000
   */
  timeout?: number | undefined;
  /**
   * The maximum number of toasts that can be displayed at once.
   * When the limit is exceeded, the oldest toasts are marked as `limited` (via the `data-limited`
   * attribute) rather than removed, so they can be hidden or animated out.
   * @default 3
   */
  limit?: number | undefined;
  /** A global manager for toasts to use outside of the component tree. */
  toastManager?: ToastManager | undefined;
}

export function ToastProvider(props: ToastProviderProps): JSX.Element {
  const store = new ToastStore({
    timeout: untrack(() => props.timeout ?? 5000),
    limit: untrack(() => props.limit ?? 3),
    viewport: null,
    toasts: [],
    hovering: false,
    focused: false,
    isWindowFocused: true,
    prevFocusElement: null,
  });

  const [state, setState] = createSignal(store.state, { ownedWrite: true });
  const unsubscribe = store.subscribe(() => setState(() => store.state));
  onCleanup(() => {
    unsubscribe();
    store.dispose();
  });

  // Changing `limit` also recomputes each toast's `limited` flag.
  createEffect(
    () => [props.timeout ?? 5000, props.limit ?? 3] as const,
    ([timeout, limit]) => {
      store.syncProviderProps(timeout, limit);
    },
  );

  createEffect(
    () => props.toastManager,
    (toastManager) => {
      if (!toastManager) {
        return undefined;
      }
      return toastManager[' subscribe'](({ action, options }) => {
        if (action === 'promise') {
          store.promiseToast(options.promise, options);
        } else if (action === 'update') {
          store.updateToast(options.id, options.updates);
        } else if (action === 'close') {
          store.closeToast(options.id);
        } else {
          store.addToast(options);
        }
      });
    },
  );

  const context: ToastContextValue = { store, state };

  return <ToastContext value={context}>{props.children}</ToastContext>;
}
