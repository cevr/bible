// Upstream: packages/react/src/drawer/provider/DrawerProvider.tsx
//
// Tracks the drawers open inside it, so `Drawer.Indent` and
// `Drawer.IndentBackground` can push the page back while any drawer is open
// and follow the frontmost drawer's swipe.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { DrawerProviderContext, type DrawerVisualState } from './DrawerProviderContext.ts';

export interface DrawerProviderState {}

export interface DrawerProviderProps {
  children?: JSX.Element;
}

function finiteOr(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Number.isFinite(value) ? value : 0;
}

/**
 * Provides the open state of the drawers inside it to `Drawer.Indent`.
 * Doesn't render its own HTML element.
 */
export function DrawerProvider(props: DrawerProviderProps): JSX.Element {
  const [openDrawers, setOpenDrawers] = createSignal<ReadonlySet<object>>(new Set(), {
    ownedWrite: true,
  });
  const [visualState, setVisualStateSignal] = createSignal<DrawerVisualState>(
    { swipeProgress: 0, frontmostHeight: 0 },
    { ownedWrite: true },
  );

  const setDrawerOpen = (drawer: object, open: boolean) => {
    setOpenDrawers((previous) => {
      if (previous.has(drawer) === open) {
        return previous;
      }
      const next = new Set(previous);
      if (open) {
        next.add(drawer);
      } else {
        next.delete(drawer);
      }
      return next;
    });
  };

  const context: DrawerProviderContext = {
    setDrawerOpen,
    removeDrawer: (drawer) => setDrawerOpen(drawer, false),
    active: () => openDrawers().size > 0,
    visualState,
    setVisualState(next) {
      setVisualStateSignal((previous) => {
        const swipeProgress = finiteOr(next.swipeProgress, previous.swipeProgress);
        const frontmostHeight = finiteOr(next.frontmostHeight, previous.frontmostHeight);
        if (
          swipeProgress === previous.swipeProgress &&
          frontmostHeight === previous.frontmostHeight
        ) {
          return previous;
        }
        return { swipeProgress, frontmostHeight };
      });
    },
  };

  return <DrawerProviderContext value={context}>{props.children}</DrawerProviderContext>;
}
