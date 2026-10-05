// Upstream: packages/react/src/menu/portal/MenuPortal.tsx,
// packages/react/src/menu/portal/MenuPortalContext.ts
//
// Moves the menu's popup into a portal node at the end of `<body>` (or
// `container`). Renders only while the menu is mounted (upstream's
// `keepMounted` is left out: no page keeps a closed menu in the DOM).
import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

const MenuPortalContext = createContext(false);

/** Throws outside a `Menu.Portal`: the positioner must render inside one. */
export function useMenuPortalContext(): void {
  if (!useContext(MenuPortalContext)) {
    throw new Error('Base UI: <Menu.Portal> is missing.');
  }
}

export interface MenuPortalState {}

export interface MenuPortalProps extends FloatingPortalProps {}

export function MenuPortal(props: MenuPortalProps): JSX.Element {
  const { store } = useMenuRootContext();
  return (
    <Show when={store.mounted()}>
      <MenuPortalContext value={true}>
        <FloatingPortal {...props} />
      </MenuPortalContext>
    </Show>
  );
}
