// Upstream: packages/react/src/drawer/popup/DrawerPopupCssVars.ts,
// packages/react/src/drawer/popup/DrawerPopupDataAttributes.ts,
// packages/react/src/drawer/content/drawerContentAttribute.ts
//
// The `data-*` attributes and CSS variables of the drawer's parts. The popup
// carries its swipe as CSS variables (the movement so far, how hard the
// release was) for the consumer's transform and transition.
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping.ts';

export const DrawerPopupCssVars = {
  /** The swipe movement on the X axis. */
  swipeMovementX: '--drawer-swipe-movement-x',
  /** The swipe movement on the Y axis. */
  swipeMovementY: '--drawer-swipe-movement-y',
  /** A scalar (0.1-1) to scale the swipe release transition's duration by. */
  swipeStrength: '--drawer-swipe-strength',
} as const;

export const DrawerPopupDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
  /** Present when the drawer is nested within a dialog. */
  nested: 'data-nested',
  /** Present when the drawer is dismissed by swiping. */
  swipeDismiss: 'data-swipe-dismiss',
  /** The swipe direction: `up`, `down`, `left` or `right`. */
  swipeDirection: 'data-swipe-direction',
  /** Present when the drawer is being swiped. */
  swiping: 'data-swiping',
} as const;

/** Marks `Drawer.Content`: a press inside it never starts a swipe. */
export const DRAWER_CONTENT_ATTRIBUTE = 'data-drawer-content';
