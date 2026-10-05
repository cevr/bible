// Upstream: packages/react/src/dialog/root/DialogRootContext.ts
//
// What a dialog's parts read from their root: the store, and the
// interaction props the root assembled for the popup. Drawers are dialogs
// underneath and share it.
import { createContext, useContext } from 'solid-js';

import type { HTMLProps } from '../../internals/types.ts';
import type { DialogStore } from '../store/DialogStore.ts';

export interface DialogRootContext {
  store: DialogStore;
  popupProps: HTMLProps;
}

export const DialogRootContext = createContext<DialogRootContext | null>(null);

export function useDialogRootContext(): DialogRootContext {
  const context = useContext(DialogRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: DialogRootContext is missing. Dialog parts must be placed within <Dialog.Root>.',
    );
  }
  return context;
}

export function useDialogRootContextOptional(): DialogRootContext | null {
  return useContext(DialogRootContext);
}
