// Upstream: packages/react/src/dialog/portal/DialogPortal.tsx,
// packages/react/src/dialog/portal/DialogPortalContext.ts
//
// Moves the dialog's parts into a portal node at the end of `<body>` (or
// `container`). Renders only while the dialog is mounted (upstream's
// `keepMounted` is left out: no page keeps a closed dialog in the DOM). A
// modal dialog gets a transparent internal backdrop that catches outside
// presses, so the page underneath does not receive them.
import type { JSX } from '@solidjs/web';
import { createContext, onCleanup, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

const DialogPortalContext = createContext(false);

/** Throws outside a `Dialog.Portal`: the popup must render inside one. */
export function useDialogPortalContext(): void {
  if (!useContext(DialogPortalContext)) {
    throw new Error('Base UI: <Dialog.Portal> is missing.');
  }
}

export interface DialogPortalState {}

export interface DialogPortalProps extends FloatingPortalProps {}

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 */
export function DialogPortal(props: DialogPortalProps): JSX.Element {
  const { store } = useDialogRootContext();

  function ModalBackdrop() {
    onCleanup(() => {
      store.internalBackdropRef.current = null;
    });
    return (
      <InternalBackdrop
        ref={(el: HTMLDivElement) => {
          store.internalBackdropRef.current = el;
        }}
        inert={!store.open() || undefined}
      />
    );
  }

  return (
    <Show when={store.mounted()}>
      <DialogPortalContext value={true}>
        <FloatingPortal {...props}>
          <Show when={store.modal() === true}>
            <ModalBackdrop />
          </Show>
          {props.children}
        </FloatingPortal>
      </DialogPortalContext>
    </Show>
  );
}
