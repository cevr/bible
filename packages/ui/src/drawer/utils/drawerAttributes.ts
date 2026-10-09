// Upstream: packages/react/src/drawer/popup/DrawerPopupCssVars.ts,
// packages/react/src/drawer/popup/DrawerPopupDataAttributes.ts,
// packages/react/src/drawer/content/drawerContentAttribute.ts
//
// The `data-*` attributes and CSS variables of the drawer's parts. The popup
// carries its swipe as CSS variables (the movement so far) for the consumer's
// transform.
export const DrawerPopupCssVars = {
  /** The swipe movement on the X axis. */
  swipeMovementX: '--drawer-swipe-movement-x',
  /** The swipe movement on the Y axis. */
  swipeMovementY: '--drawer-swipe-movement-y',
} as const;

export const DrawerPopupDataAttributes = {
  /** Present when the drawer is dismissed by swiping. */
  swipeDismiss: 'data-swipe-dismiss',
  /** The swipe direction: `up`, `down`, `left` or `right`. */
  swipeDirection: 'data-swipe-direction',
  /** Present when the drawer is being swiped. */
  swiping: 'data-swiping',
} as const;

/** Marks `Drawer.Content`: a press inside it never starts a swipe. */
export const DRAWER_CONTENT_ATTRIBUTE = 'data-drawer-content';
