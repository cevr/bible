// Upstream: packages/react/src/context-menu/root/ContextMenuRootContext.ts
//
// What a context menu shares with the menu it opens: the point the menu is
// anchored at (the pointer, or the long-press touch), the backdrop whose own
// right-click must not reach the browser, and the gesture bookkeeping that
// keeps the releasing mouseup of the opening press from activating an item.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface ContextMenuAnchor {
  getBoundingClientRect: () => DOMRect;
}

export interface ContextMenuRootContext {
  anchor: Accessor<ContextMenuAnchor>;
  setAnchor: (anchor: ContextMenuAnchor) => void;
  internalBackdropRef: { current: HTMLElement | null };
  allowMouseUpTriggerRef: { current: boolean };
  initialCursorPointRef: { current: { x: number; y: number } | null };
  rootId: string;
}

export const ContextMenuRootContext = createContext<ContextMenuRootContext | null>(null);

export function useContextMenuRootContext(): ContextMenuRootContext | null {
  return useContext(ContextMenuRootContext);
}

/** The context menu around a part that only works inside one; throws outside. */
export function useContextMenuRootContextStrict(): ContextMenuRootContext {
  const context = useContext(ContextMenuRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
    );
  }
  return context;
}
