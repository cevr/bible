// Upstream: packages/react/src/tooltip/portal/TooltipPortal.tsx,
// packages/react/src/tooltip/portal/TooltipPortalContext.ts
//
// Moves the tooltip's popup into a portal node at the end of `<body>` (or
// `container`). Renders only while the tooltip is mounted, unless
// `keepMounted`. Upstream uses a focus-guard-free portal; the shared
// `FloatingPortal` renders no guards here either, since a tooltip has no
// focus manager.
import type { JSX } from '@solidjs/web';
import { createContext, omit, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { useTooltipRootContext } from '../root/TooltipRootContext.ts';

const TooltipPortalContext = createContext<{ keepMounted: boolean } | null>(null);

export function useTooltipPortalContext(): () => boolean {
  const value = useContext(TooltipPortalContext);
  if (value === null) {
    throw new Error('Base UI: <Tooltip.Portal> is missing.');
  }
  return () => value.keepMounted;
}

export interface TooltipPortalState {}

export interface TooltipPortalProps extends Omit<FloatingPortalProps, 'portalOwnerRole'> {
  /** Whether the portal stays in the DOM while the tooltip is closed. @default false */
  keepMounted?: boolean | undefined;
}

export function TooltipPortal(props: TooltipPortalProps): JSX.Element {
  const { store } = useTooltipRootContext();
  const portalProps = omit(props, 'keepMounted');
  const value = {
    get keepMounted() {
      return props.keepMounted ?? false;
    },
  };
  return (
    <Show when={store.mounted() || (props.keepMounted ?? false)}>
      <TooltipPortalContext value={value}>
        <FloatingPortal {...portalProps} />
      </TooltipPortalContext>
    </Show>
  );
}
