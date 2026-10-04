// Upstream: packages/react/src/drawer/provider/DrawerProviderContext.ts
//
// What `Drawer.Provider` shares with the drawers and the indent inside it:
// whether any drawer is open, and the frontmost drawer's swipe progress and
// height, which the indent follows while a drawer is swiped.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface DrawerVisualState {
  swipeProgress: number;
  frontmostHeight: number;
}

export interface DrawerProviderContext {
  setDrawerOpen: (drawer: object, open: boolean) => void;
  removeDrawer: (drawer: object) => void;
  /** Whether any drawer in the provider is open. */
  active: Accessor<boolean>;
  visualState: Accessor<DrawerVisualState>;
  setVisualState: (state: Partial<DrawerVisualState>) => void;
}

export const DrawerProviderContext = createContext<DrawerProviderContext | null>(null);

export function useDrawerProviderContext(): DrawerProviderContext | null {
  return useContext(DrawerProviderContext);
}
