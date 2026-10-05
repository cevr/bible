// Upstream: packages/react/src/dialog/index.ts
//
// The dialog: `Dialog.Root`, `Dialog.Portal`, `Dialog.Backdrop`,
// `Dialog.Popup`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`, and
// the parts' types.
export * as Dialog from './index.parts.ts';

export type * from './backdrop/DialogBackdrop.tsx';
export type * from './close/DialogClose.tsx';
export type * from './popup/DialogPopup.tsx';
export type * from './portal/DialogPortal.tsx';
export type * from './root/DialogRoot.tsx';
export type * from './title/DialogTitle.tsx';
