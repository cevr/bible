// Upstream: packages/react/src/alert-dialog/root/AlertDialogRoot.tsx,
// packages/react/src/alert-dialog/trigger/AlertDialogTrigger.tsx
//
// An alert dialog is a dialog that demands a response: always modal, never
// closed by an outside press (Escape and its close buttons still close it),
// with `role="alertdialog"`. Its other parts are the dialog's.
import type { JSX } from '@solidjs/web';

import { type DialogRootProps, DialogRootInternal } from '../dialog/root/DialogRoot.tsx';

export interface AlertDialogRootState {}

export interface AlertDialogRootProps extends Omit<
  DialogRootProps,
  'modal' | 'disablePointerDismissal'
> {}

/**
 * Groups all parts of the alert dialog.
 * Doesn't render its own HTML element.
 */
export function AlertDialogRoot(props: AlertDialogRootProps): JSX.Element {
  return <DialogRootInternal {...props} mode="alert-dialog" />;
}
