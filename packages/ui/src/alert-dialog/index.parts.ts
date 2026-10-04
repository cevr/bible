// Upstream: packages/react/src/alert-dialog/index.parts.ts
//
// The parts of an alert dialog: its own root, the dialog's other parts.
export { AlertDialogRoot as Root } from './AlertDialogRoot.tsx';
export { DialogBackdrop as Backdrop } from '../dialog/backdrop/DialogBackdrop.tsx';
export { DialogClose as Close } from '../dialog/close/DialogClose.tsx';
export { DialogPopup as Popup } from '../dialog/popup/DialogPopup.tsx';
export { DialogPortal as Portal } from '../dialog/portal/DialogPortal.tsx';
export {
  DialogDescription as Description,
  DialogTitle as Title,
} from '../dialog/title/DialogTitle.tsx';
export { DialogTrigger as Trigger } from '../dialog/trigger/DialogTrigger.tsx';
export { DialogViewport as Viewport } from '../dialog/viewport/DialogViewport.tsx';
