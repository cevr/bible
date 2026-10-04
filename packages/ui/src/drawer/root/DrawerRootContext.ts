// Upstream: packages/react/src/drawer/root/DrawerRootContext.ts
//
// What a drawer's parts read from their root besides the dialog store: the
// swipe direction, the snap points (resolved once against the measured
// popup and viewport), the popup's measured height, and the state of the
// drawers nested in it (open, swiping, how far, how tall), which they report
// up the stack through the `onNested*` callbacks.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { SwipeDirection } from '../../utils/useSwipeDismiss.ts';
import type { DialogChangeEventReason } from '../../dialog/store/DialogStore.ts';
import type { DrawerSnapPoint, ResolvedDrawerSnapPoint } from './snapPoints.ts';

export type DrawerSwipeDirection = SwipeDirection;

export type DrawerSnapPointChangeEventDetails = BaseUIChangeEventDetails<DialogChangeEventReason>;

export interface DrawerRootContext {
  swipeDirection: Accessor<DrawerSwipeDirection>;
  /**
   * Whether `Drawer.SwipeArea` is driving an open gesture (writing the popup's
   * movement variables itself); the viewport leaves them alone on open then.
   */
  swipeAreaActiveRef: { current: boolean };
  /** Whether velocity never skips a snap point. */
  snapToSequentialPoints: Accessor<boolean>;
  snapPoints: Accessor<ReadonlyArray<DrawerSnapPoint> | undefined>;
  activeSnapPoint: Accessor<DrawerSnapPoint | null>;
  setActiveSnapPoint: (
    snapPoint: DrawerSnapPoint | null,
    eventDetails?: DrawerSnapPointChangeEventDetails,
  ) => void;
  /** The snap points resolved against the measured popup and viewport. */
  resolvedSnapPoints: Accessor<ReadonlyArray<ResolvedDrawerSnapPoint>>;
  /** How far the active snap point pushes the popup down, or `null` with none. */
  activeSnapPointOffset: Accessor<number | null>;
  /** The measured height of the popup. */
  popupHeight: Accessor<number>;
  onPopupHeightChange: (height: number) => void;
  /** The measured height of the frontmost open drawer in this drawer's stack. */
  frontmostHeight: Accessor<number>;
  /** Whether a nested drawer is present (open or closing). */
  hasNestedDrawer: Accessor<boolean>;
  /** Whether a nested drawer is being swiped. */
  nestedSwiping: Accessor<boolean>;
  /** How far a nested drawer's swipe has progressed. */
  nestedSwipeProgress: Accessor<number>;
  onNestedDrawerPresenceChange: (present: boolean) => void;
  onNestedFrontmostHeightChange: (height: number) => void;
  onNestedSwipingChange: (swiping: boolean) => void;
  onNestedSwipeProgressChange: (progress: number) => void;
  /** The parent drawer's callbacks, for a nested drawer. */
  notifyParentFrontmostHeight: ((height: number) => void) | undefined;
  notifyParentSwipingChange: ((swiping: boolean) => void) | undefined;
  notifyParentSwipeProgressChange: ((progress: number) => void) | undefined;
  notifyParentHasNestedDrawer: ((present: boolean) => void) | undefined;
}

export const DrawerRootContext = createContext<DrawerRootContext | null>(null);

export function useDrawerRootContext(): DrawerRootContext {
  const context = useContext(DrawerRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: DrawerRootContext is missing. Drawer parts must be placed within <Drawer.Root>.',
    );
  }
  return context;
}

export function useDrawerRootContextOptional(): DrawerRootContext | null {
  return useContext(DrawerRootContext);
}
