// Upstream: packages/react/src/menu/root/MenuRootContext.ts
//
// What a menu's parts read from their root: the store, where the menu sits
// (top level, submenu, context menu), and the interaction props the root
// assembled for the trigger, the popup and the items.
import { createContext, useContext } from 'solid-js';

import type { HTMLProps, Orientation } from '../../internals/types.ts';
import type { MenuParent, MenuStore } from '../store/MenuStore.ts';

export interface MenuRootContext {
  store: MenuStore;
  parent: MenuParent;
  orientation: () => Orientation;
  /** The props of the trigger that opened the menu (`active`) or of another trigger. */
  triggerProps: (active: boolean) => HTMLProps;
  popupProps: HTMLProps;
  itemProps: HTMLProps;
  /** The parent menu's item props, for a submenu trigger (an item of the parent list). */
  parentItemProps: HTMLProps;
  /** Reports the highlighted item again once the item registry settles. */
  syncHighlightedItem: () => void;
}

export const MenuRootContext = createContext<MenuRootContext | null>(null);

export function useMenuRootContext(): MenuRootContext {
  const context = useContext(MenuRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>.',
    );
  }
  return context;
}

export function useMenuRootContextOptional(): MenuRootContext | null {
  return useContext(MenuRootContext);
}
