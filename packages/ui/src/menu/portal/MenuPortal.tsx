// Upstream: packages/react/src/menu/portal/MenuPortal.tsx,
// packages/react/src/menu/portal/MenuPortalContext.ts
//
// Moves the menu's popup into a portal node at the end of `<body>` (or
// `container`). Renders only while the menu is mounted, unless `keepMounted`.
import type { JSX } from '@solidjs/web';
import { createContext, omit, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

const MenuPortalContext = createContext<{ keepMounted: boolean } | null>(null);

export function useMenuPortalContext(): () => boolean {
  const value = useContext(MenuPortalContext);
  if (value === null) {
    throw new Error('Base UI: <Menu.Portal> is missing.');
  }
  return () => value.keepMounted;
}

export interface MenuPortalState {}

export interface MenuPortalProps extends FloatingPortalProps {
  /** Whether the portal stays in the DOM while the menu is closed. @default false */
  keepMounted?: boolean | undefined;
}

export function MenuPortal(props: MenuPortalProps): JSX.Element {
  const { store } = useMenuRootContext();
  const portalProps = omit(props, 'keepMounted');
  const value = {
    get keepMounted() {
      return props.keepMounted ?? false;
    },
  };
  return (
    <Show when={store.mounted() || (props.keepMounted ?? false)}>
      <MenuPortalContext value={value}>
        <FloatingPortal {...portalProps} />
      </MenuPortalContext>
    </Show>
  );
}
