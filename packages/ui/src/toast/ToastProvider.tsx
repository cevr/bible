// Upstream: packages/react/src/toast/provider/ToastProvider.tsx
//
// Owns the toasts of the parts inside it: a store created once, kept in
// step with the `limit` prop, and fed by a `toastManager` created outside
// the tree when one is given. Upstream's provider-wide `timeout` is left
// out: a toast takes its own `timeout`, else 5000 ms.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';

import type { ToastManager } from './createToastManager.ts';
import { ToastStore } from './store.ts';
import { ToastContext, type ToastContextValue } from './ToastProviderContext.ts';

interface ToastProviderProps {
  children?: JSX.Element;
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

  createEffect(
    () => props.limit ?? 3,
    (limit) => {
      store.setLimit(limit);
    },
  );

  createEffect(
    () => props.toastManager,
    (toastManager) => {
      if (!toastManager) {
        return undefined;
      }
      return toastManager[' subscribe']((event) => {
        if (event.action === 'close') {
          store.closeToast(event.options.id);
        } else {
          store.addToast(event.options);
        }
      });
    },
  );

  const context: ToastContextValue = { store, state };

  return <ToastContext value={context}>{props.children}</ToastContext>;
}
