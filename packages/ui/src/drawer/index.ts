// Upstream: packages/react/src/drawer/index.ts
//
// The drawer: a dialog that slides in from an edge and swipes away.
// `Drawer.Root`, `Drawer.SwipeArea`, `Drawer.Portal`,
// `Drawer.Backdrop`, `Drawer.Viewport`, `Drawer.Popup`, `Drawer.Content`,
// `Drawer.Title`, `Drawer.Description`, `Drawer.Close`, and
// `Drawer.Provider` with `Drawer.Indent` and `Drawer.IndentBackground`; the
// parts' types, and their `data-*` attributes and CSS variables.
export * as Drawer from './index.parts.ts';

export type * from './backdrop/DrawerBackdrop.tsx';
export type * from './content/DrawerContent.tsx';
export type * from './indent/DrawerIndent.tsx';
export type * from './popup/DrawerPopup.tsx';
export type * from './provider/DrawerProvider.tsx';
export type * from './root/DrawerRoot.tsx';
export type * from './swipe-area/DrawerSwipeArea.tsx';
export type * from './viewport/DrawerViewport.tsx';
export type {
  DialogCloseProps as DrawerCloseProps,
  DialogCloseState as DrawerCloseState,
} from '../dialog/close/DialogClose.tsx';
export type {
  DialogPortalProps as DrawerPortalProps,
  DialogPortalState as DrawerPortalState,
} from '../dialog/portal/DialogPortal.tsx';
export type {
  DialogDescriptionProps as DrawerDescriptionProps,
  DialogDescriptionState as DrawerDescriptionState,
  DialogTitleProps as DrawerTitleProps,
  DialogTitleState as DrawerTitleState,
} from '../dialog/title/DialogTitle.tsx';
export { DialogCloseDataAttributes as DrawerCloseDataAttributes } from '../dialog/utils/stateAttributesMapping.ts';
export {
  DrawerBackdropCssVars as DrawerBackdropCssVariables,
  DrawerBackdropDataAttributes,
  DrawerPopupCssVars as DrawerPopupCssVariables,
  DrawerPopupDataAttributes,
  DrawerSwipeAreaDataAttributes,
  DrawerViewportDataAttributes,
} from './utils/drawerAttributes.ts';
