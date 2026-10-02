// Upstream: packages/react/src/context-menu/root/ContextMenuRootContext.ts
//
// What a context menu shares with the menu it opens: the point the menu is
// anchored at (the pointer, or the long-press touch), the backdrops whose own
// right-click must not reach the browser, and the gesture bookkeeping that
// keeps the releasing mouseup of the opening press from activating an item.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';

export interface ContextMenuAnchor {
  getBoundingClientRect: () => DOMRect;
}

export interface ContextMenuRootContext {
  anchor: Accessor<ContextMenuAnchor>;
  setAnchor: (anchor: ContextMenuAnchor) => void;
  backdropRef: { current: HTMLElement | null };
  internalBackdropRef: { current: HTMLElement | null };
  /** The menu's open-change pipeline, set by the menu root. */
  actionsRef: {
    current: { setOpen: (open: boolean, details: BaseUIChangeEventDetails) => void } | null;
  };
  positionerRef: { current: HTMLElement | null };
  allowMouseUpTriggerRef: { current: boolean };
  initialCursorPointRef: { current: { x: number; y: number } | null };
  rootId: string;
}

export const ContextMenuRootContext = createContext<ContextMenuRootContext | null>(null);

export function useContextMenuRootContext(): ContextMenuRootContext | null {
  return useContext(ContextMenuRootContext);
}
