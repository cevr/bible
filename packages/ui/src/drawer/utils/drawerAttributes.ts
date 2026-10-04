// Upstream: packages/react/src/drawer/popup/DrawerPopupCssVars.ts,
// packages/react/src/drawer/popup/DrawerPopupDataAttributes.ts,
// packages/react/src/drawer/backdrop/DrawerBackdropCssVars.ts,
// packages/react/src/drawer/backdrop/DrawerBackdropDataAttributes.ts,
// packages/react/src/drawer/swipe-area/DrawerSwipeAreaDataAttributes.ts,
// packages/react/src/drawer/viewport/DrawerViewportDataAttributes.ts,
// packages/react/src/drawer/content/drawerContentAttribute.ts
//
// The `data-*` attributes and CSS variables of the drawer's parts. The popup
// carries its swipe as CSS variables (the movement so far, the offset of the
// active snap point, how hard the release was) for the consumer's transform
// and transition; the backdrop carries how far a swipe has progressed.
import { CommonPopupDataAttributes } from '../../utils/popupStateMapping.ts';

export const DrawerPopupCssVars = {
  /** The number of nested drawers that are open. */
  nestedDrawers: '--nested-drawers',
  /** The height of the drawer popup. */
  height: '--drawer-height',
  /** The height of the frontmost open drawer in the nested drawer stack. */
  frontmostHeight: '--drawer-frontmost-height',
  /** The swipe movement on the X axis. */
  swipeMovementX: '--drawer-swipe-movement-x',
  /** The swipe movement on the Y axis. */
  swipeMovementY: '--drawer-swipe-movement-y',
  /** The snap point offset used for translating the drawer. */
  snapPointOffset: '--drawer-snap-point-offset',
  /** A scalar (0.1-1) to scale the swipe release transition's duration by. */
  swipeStrength: '--drawer-swipe-strength',
} as const;

export const DrawerBackdropCssVars = {
  /** How far a swipe has progressed toward dismissal (0-1). */
  swipeProgress: '--drawer-swipe-progress',
} as const;

export const DrawerPopupDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
  /** Present when the drawer is nested within another drawer or dialog. */
  nested: 'data-nested',
  /** Present when the drawer is at the expanded (full-height) snap point. */
  expanded: 'data-expanded',
  /** Present when a nested drawer is open. */
  nestedDrawerOpen: 'data-nested-drawer-open',
  /** Present when a nested drawer is being swiped. */
  nestedDrawerSwiping: 'data-nested-drawer-swiping',
  /** Present when the drawer is dismissed by swiping. */
  swipeDismiss: 'data-swipe-dismiss',
  /** The swipe direction: `up`, `down`, `left` or `right`. */
  swipeDirection: 'data-swipe-direction',
  /** Present when the drawer is being swiped. */
  swiping: 'data-swiping',
} as const;

export const DrawerBackdropDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
} as const;

export const DrawerViewportDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
  /** Present when the drawer is nested within another drawer. */
  nested: 'data-nested',
} as const;

export const DrawerSwipeAreaDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  /** Present when the swipe area is disabled. */
  disabled: 'data-disabled',
  /** The swipe direction that opens the drawer. */
  swipeDirection: 'data-swipe-direction',
  /** Present while the swipe area is being swiped. */
  swiping: 'data-swiping',
} as const;

/** Marks `Drawer.Content`: a press inside it never starts a swipe. */
export const DRAWER_CONTENT_ATTRIBUTE = 'data-drawer-content';
