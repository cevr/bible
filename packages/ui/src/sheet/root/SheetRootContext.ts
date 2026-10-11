// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetOverlayProps, InternalSheetContext). Copyright 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2: the owner's settings live in the root, the
// mounted sheet's live state in the overlay (`SheetOverlayContext`).
//
// What a sheet's parts read from their root besides the dialog store: where
// the sheet rests, how a swipe dismisses it, its snap points and whether the
// user may dismiss it at all.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { SheetPosition, SheetSwipeDirection, SnapPoint, SwipeConfig } from '../utils/swipe.ts';

export interface SheetRootContext {
  position: Accessor<SheetPosition>;
  swipeDirection: Accessor<SheetSwipeDirection>;
  /** The geometry of `swipeDirection`. */
  config: Accessor<SwipeConfig>;
  snapPoints: Accessor<ReadonlyArray<SnapPoint> | undefined>;
  preventDismissal: Accessor<boolean>;
}

export const SheetRootContext = createContext<SheetRootContext | null>(null);

export function useSheetRootContext(): SheetRootContext {
  const context = useContext(SheetRootContext);
  if (context === null) {
    throw new Error('SheetRootContext is missing. Sheet parts must be placed within <Sheet.Root>.');
  }
  return context;
}
