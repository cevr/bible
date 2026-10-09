// Upstream: packages/react/src/drawer/viewport/DrawerViewportContext.tsx
//
// What the viewport, which runs the drawer's swipe, shares with the popup:
// whether it is being swiped and its drag styles.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface DrawerViewportContext {
  swiping: Accessor<boolean>;
  /** The popup's drag styles (read it in a tracking scope). */
  getDragStyles: () => Record<string, string | undefined>;
}

export const DrawerViewportContext = createContext<DrawerViewportContext | null>(null);

export function useDrawerViewportContext(): DrawerViewportContext | null {
  return useContext(DrawerViewportContext);
}
