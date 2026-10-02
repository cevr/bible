// Upstream: packages/react/src/drawer/viewport/DrawerViewportContext.tsx
//
// What the viewport, which runs the drawer's swipe, shares with the popup:
// whether it is being swiped, its drag styles, and how hard the release
// that dismissed it was.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface DrawerViewportContext {
  swiping: Accessor<boolean>;
  /** The popup's drag styles (read it in a tracking scope). */
  getDragStyles: () => Record<string, string | undefined>;
  /** The release's strength (0.1-1) when a swipe dismissed the drawer, else `null`. */
  swipeStrength: Accessor<number | null>;
}

export const DrawerViewportContext = createContext<DrawerViewportContext | null>(null);

export function useDrawerViewportContext(): DrawerViewportContext | null {
  return useContext(DrawerViewportContext);
}
