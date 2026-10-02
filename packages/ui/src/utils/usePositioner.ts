// Upstream: packages/react/src/utils/usePositioner.tsx,
// packages/react/src/internals/getDisabledMountTransitionStyles.ts
//
// The positioner element popups share: a presentational wrapper carrying the
// anchor positioning styles, hidden while unmounted-but-kept, ignoring the
// pointer while closing, and with transitions off for the first frame so the
// popup does not animate from its old position.
import type { JSX } from '@solidjs/web';

import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import type { TransitionStatus } from '../internals/transitions.ts';
import type { HTMLProps } from '../internals/types.ts';
import {
  type UseRenderElementComponentProps,
  useRenderElement,
} from '../internals/useRenderElement.tsx';
import { popupStateMapping } from './popupStateMapping.ts';

export interface UsePositionerOptions {
  styles: () => JSX.CSSProperties;
  transitionStatus: () => TransitionStatus;
  props?: HTMLProps | undefined;
  ref?: unknown;
  hidden: () => boolean;
  inert?: (() => boolean) | undefined;
}

export function usePositioner<State extends { open: boolean; anchorHidden: boolean }>(
  componentProps: UseRenderElementComponentProps<State>,
  state: State,
  options: UsePositionerOptions,
): JSX.Element {
  return useRenderElement('div', componentProps, {
    state,
    ref: options.ref,
    props: [
      {
        role: 'presentation',
        get hidden() {
          return options.hidden() || undefined;
        },
        get style() {
          const style: JSX.CSSProperties = { ...options.styles() };
          if (options.inert?.()) {
            style['pointer-events'] = 'none';
          }
          if (options.transitionStatus() === 'starting') {
            style.transition = 'none';
          }
          return style;
        },
      },
      options.props ?? {},
    ],
    stateAttributesMapping: popupStateMapping as StateAttributesMapping<State>,
  });
}
