// Upstream: packages/react/src/drawer/index.parts.ts
//
// The parts of a drawer, used as `Drawer.Root`, `Drawer.Popup` and so on.
// The portal, title, description and close are the dialog's.
export { DialogClose as Close } from '../dialog/close/DialogClose.tsx';
export { DialogPortal as Portal } from '../dialog/portal/DialogPortal.tsx';
export {
  DialogDescription as Description,
  DialogTitle as Title,
} from '../dialog/title/DialogTitle.tsx';
export { DrawerBackdrop as Backdrop } from './backdrop/DrawerBackdrop.tsx';
export { DrawerContent as Content } from './content/DrawerContent.tsx';
export {
  DrawerIndent as Indent,
  DrawerIndentBackground as IndentBackground,
} from './indent/DrawerIndent.tsx';
export { DrawerPopup as Popup } from './popup/DrawerPopup.tsx';
export { DrawerProvider as Provider } from './provider/DrawerProvider.tsx';
export { DrawerRoot as Root } from './root/DrawerRoot.tsx';
export { DrawerSwipeArea as SwipeArea } from './swipe-area/DrawerSwipeArea.tsx';
export { DrawerViewport as Viewport } from './viewport/DrawerViewport.tsx';
