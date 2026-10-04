// Upstream: packages/react/src/dialog/portal/DialogPortal.tsx,
// packages/react/src/dialog/portal/DialogPortalContext.ts
//
// Moves the dialog's parts into a portal node at the end of `<body>` (or
// `container`). Renders only while the dialog is mounted, unless
// `keepMounted`. A modal dialog gets a transparent internal backdrop that
// catches outside presses, so the page underneath does not receive them.
import type { JSX } from '@solidjs/web';
import { createContext, omit, onCleanup, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

const DialogPortalContext = createContext<{ keepMounted: boolean } | null>(null);

/** Whether the portal keeps its content mounted; throws outside a portal. */
export function useDialogPortalContext(): () => boolean {
  const value = useContext(DialogPortalContext);
  if (value === null) {
    throw new Error('Base UI: <Dialog.Portal> is missing.');
  }
  return () => value.keepMounted;
}

export interface DialogPortalState {}

export interface DialogPortalProps extends Omit<FloatingPortalProps, 'portalOwnerRole'> {
  /** Whether the portal stays in the DOM while the dialog is closed. @default false */
  keepMounted?: boolean | undefined;
}

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 */
export function DialogPortal(props: DialogPortalProps): JSX.Element {
  const { store } = useDialogRootContext();
  const portalProps = omit(props, 'keepMounted', 'children');
  const value = {
    get keepMounted() {
      return props.keepMounted ?? false;
    },
  };

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
    <Show when={store.mounted() || (props.keepMounted ?? false)}>
      <DialogPortalContext value={value}>
        <FloatingPortal {...portalProps}>
          <Show when={store.mounted() && store.modal() === true}>
            <ModalBackdrop />
          </Show>
          {props.children}
        </FloatingPortal>
      </DialogPortalContext>
    </Show>
  );
}
