// Upstream: packages/react/src/drawer/index.ts
//
// The drawer: a dialog that slides in from an edge and swipes away.
// `Drawer.Root`, `Drawer.Portal`, `Drawer.Viewport`, `Drawer.Popup`,
// `Drawer.Content`, `Drawer.Title` and `Drawer.Close`; the parts' types, and
// their `data-*` attributes and CSS variables.
export * as Drawer from './index.parts.ts';

export type * from './content/DrawerContent.tsx';
export type * from './popup/DrawerPopup.tsx';
export type * from './root/DrawerRoot.tsx';
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
  DialogTitleProps as DrawerTitleProps,
  DialogTitleState as DrawerTitleState,
} from '../dialog/title/DialogTitle.tsx';
export { DialogCloseDataAttributes as DrawerCloseDataAttributes } from '../dialog/utils/stateAttributesMapping.ts';
export {
  DrawerPopupCssVars as DrawerPopupCssVariables,
  DrawerPopupDataAttributes,
  DrawerViewportDataAttributes,
} from './utils/drawerAttributes.ts';
