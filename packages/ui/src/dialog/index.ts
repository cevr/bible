// Upstream: packages/react/src/dialog/index.ts
//
// The dialog: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Portal`,
// `Dialog.Backdrop`, `Dialog.Viewport`, `Dialog.Popup`, `Dialog.Title`,
// `Dialog.Description`, `Dialog.Close`, the parts' types, and their `data-*`
// attributes and CSS variables.
export * as Dialog from './index.parts.ts';

export type * from './backdrop/DialogBackdrop.tsx';
export type * from './close/DialogClose.tsx';
export type * from './popup/DialogPopup.tsx';
export type * from './portal/DialogPortal.tsx';
export type * from './root/DialogRoot.tsx';
export type * from './title/DialogTitle.tsx';
export type * from './trigger/DialogTrigger.tsx';
export type * from './viewport/DialogViewport.tsx';
export { DialogTriggerDataAttributes } from './trigger/DialogTrigger.tsx';
export {
  DialogBackdropDataAttributes,
  DialogCloseDataAttributes,
  DialogPopupCssVars as DialogPopupCssVariables,
  DialogPopupDataAttributes,
  DialogViewportDataAttributes,
} from './utils/stateAttributesMapping.ts';
