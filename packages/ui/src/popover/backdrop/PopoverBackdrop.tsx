// Upstream: packages/react/src/popover/backdrop/PopoverBackdrop.tsx
//
// An optional overlay under the popover, mounted with it. It ignores the
// pointer when the popover was opened by hover, so the pointer can still
// reach the trigger and the page.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import { REASONS } from '../../internals/reasons.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';

export interface PopoverBackdropState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

export interface PopoverBackdropProps extends BaseUIComponentProps<'div', PopoverBackdropState> {}

export function PopoverBackdrop(componentProps: PopoverBackdropProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: PopoverBackdropState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };
  return useRenderElement('div', componentProps, {
    state,
    stateAttributesMapping: popupTransitionStateMapping,
    props: [
      {
        role: 'presentation',
        get hidden() {
          return !store.mounted() || undefined;
        },
        get style() {
          return {
            'pointer-events':
              store.openChangeReason() === REASONS.triggerHover ? 'none' : undefined,
            'user-select': 'none',
            '-webkit-user-select': 'none',
          };
        },
      },
      elementProps,
    ],
  });
}
