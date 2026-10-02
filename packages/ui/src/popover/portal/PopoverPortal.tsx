// Upstream: packages/react/src/popover/portal/PopoverPortal.tsx,
// packages/react/src/popover/portal/PopoverPortalContext.ts
//
// Moves the popover's popup into a portal node at the end of `<body>` (or
// `container`). Renders only while the popover is mounted, unless `keepMounted`.
import type { JSX } from '@solidjs/web';
import { createContext, omit, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';

const PopoverPortalContext = createContext<{ keepMounted: boolean } | null>(null);

export function usePopoverPortalContext(): () => boolean {
  const value = useContext(PopoverPortalContext);
  if (value === null) {
    throw new Error('Base UI: <Popover.Portal> is missing.');
  }
  return () => value.keepMounted;
}

export interface PopoverPortalState {}

export interface PopoverPortalProps extends Omit<FloatingPortalProps, 'portalOwnerRole'> {
  /** Whether the portal stays in the DOM while the popover is closed. @default false */
  keepMounted?: boolean | undefined;
}

export function PopoverPortal(props: PopoverPortalProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const portalProps = omit(props, 'keepMounted');
  const value = {
    get keepMounted() {
      return props.keepMounted ?? false;
    },
  };
  return (
    <Show when={store.mounted() || (props.keepMounted ?? false)}>
      <PopoverPortalContext value={value}>
        <FloatingPortal {...portalProps} />
      </PopoverPortalContext>
    </Show>
  );
}
