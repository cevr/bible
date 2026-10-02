// Upstream: packages/react/src/popover/arrow/PopoverArrow.tsx
//
// The arrow pointing from the popup to its anchor, placed by the positioner
// (`data-uncentered` when it cannot point at the anchor's center).
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupStateMapping } from '../../utils/popupStateMapping.ts';
import { usePopoverPositionerContext } from '../positioner/PopoverPositioner.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';

export interface PopoverArrowState {
  open: boolean;
  side: Side;
  align: Align;
  uncentered: boolean;
}

export interface PopoverArrowProps extends BaseUIComponentProps<'div', PopoverArrowState> {}

export function PopoverArrow(componentProps: PopoverArrowProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: PopoverArrowState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get uncentered() {
      return positioner.arrowUncentered();
    },
  };
  return useRenderElement('div', componentProps, {
    ref: (el: HTMLElement) => positioner.setArrowElement(el),
    stateAttributesMapping: popupStateMapping,
    state,
    props: [
      {
        get style() {
          return positioner.arrowStyles();
        },
        'aria-hidden': 'true',
      },
      elementProps,
    ],
  });
}
