// Upstream: packages/react/src/alert-dialog/index.ts
//
// The alert dialog: `AlertDialog.Root` and the dialog's parts under their
// alert-dialog names, with their types and `data-*` attributes.
export * as AlertDialog from './index.parts.ts';

export type * from './AlertDialogRoot.tsx';
export type {
  DialogBackdropProps as AlertDialogBackdropProps,
  DialogBackdropState as AlertDialogBackdropState,
} from '../dialog/backdrop/DialogBackdrop.tsx';
export type {
  DialogCloseProps as AlertDialogCloseProps,
  DialogCloseState as AlertDialogCloseState,
} from '../dialog/close/DialogClose.tsx';
export type {
  DialogPopupProps as AlertDialogPopupProps,
  DialogPopupState as AlertDialogPopupState,
} from '../dialog/popup/DialogPopup.tsx';
export type {
  DialogPortalProps as AlertDialogPortalProps,
  DialogPortalState as AlertDialogPortalState,
} from '../dialog/portal/DialogPortal.tsx';
export type {
  DialogDescriptionProps as AlertDialogDescriptionProps,
  DialogDescriptionState as AlertDialogDescriptionState,
  DialogTitleProps as AlertDialogTitleProps,
  DialogTitleState as AlertDialogTitleState,
} from '../dialog/title/DialogTitle.tsx';
export type {
  DialogTriggerProps as AlertDialogTriggerProps,
  DialogTriggerState as AlertDialogTriggerState,
} from '../dialog/trigger/DialogTrigger.tsx';
export type {
  DialogViewportProps as AlertDialogViewportProps,
  DialogViewportState as AlertDialogViewportState,
} from '../dialog/viewport/DialogViewport.tsx';
export type {
  DialogChangeEventDetails as AlertDialogChangeEventDetails,
  DialogChangeEventReason as AlertDialogChangeEventReason,
  DialogRootActions as AlertDialogRootActions,
} from '../dialog/root/DialogRoot.tsx';
export { DialogTriggerDataAttributes as AlertDialogTriggerDataAttributes } from '../dialog/trigger/DialogTrigger.tsx';
export {
  DialogBackdropDataAttributes as AlertDialogBackdropDataAttributes,
  DialogCloseDataAttributes as AlertDialogCloseDataAttributes,
  DialogPopupCssVars as AlertDialogPopupCssVariables,
  DialogPopupDataAttributes as AlertDialogPopupDataAttributes,
  DialogViewportDataAttributes as AlertDialogViewportDataAttributes,
} from '../dialog/utils/stateAttributesMapping.ts';
