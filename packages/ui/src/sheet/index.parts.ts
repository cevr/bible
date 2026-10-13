// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (its exports). Copyright 2026 Adobe, Apache-2.0 (`./LICENSE`).
//
// The parts of a sheet, used as `Sheet.Root`, `Sheet.Popup` and so on.
// The portal, title and close are the dialog's.
export { DialogClose as Close } from '../dialog/close/DialogClose.tsx';
export { DialogPortal as Portal } from '../dialog/portal/DialogPortal.tsx';
export {
  DialogDescription as Description,
  DialogTitle as Title,
} from '../dialog/title/DialogTitle.tsx';
export { SheetBackdrop as Backdrop } from './backdrop/SheetBackdrop.tsx';
export { SheetContent as Content } from './content/SheetContent.tsx';
export { SheetOverlay as Overlay } from './overlay/SheetOverlay.tsx';
export { SheetPopup as Popup } from './popup/SheetPopup.tsx';
export { SheetRoot as Root } from './root/SheetRoot.tsx';
