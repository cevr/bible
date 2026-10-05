// Upstream: packages/react/src/drawer/root/DrawerRootContext.ts
//
// What a drawer's parts read from their root besides the dialog store: the
// direction a swipe dismisses the drawer in.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { SwipeDirection } from '../../utils/useSwipeDismiss.ts';

export type DrawerSwipeDirection = SwipeDirection;

export interface DrawerRootContext {
  swipeDirection: Accessor<DrawerSwipeDirection>;
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
