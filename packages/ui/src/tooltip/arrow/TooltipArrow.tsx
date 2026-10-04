// Upstream: packages/react/src/tooltip/arrow/TooltipArrow.tsx,
// packages/react/src/tooltip/arrow/TooltipArrowDataAttributes.ts
//
// The arrow pointing from the tooltip to its anchor, placed by the
// positioner (`data-uncentered` when it cannot point at the anchor's center).
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupStateMapping } from '../../utils/popupStateMapping.ts';
import { useTooltipPositionerContext } from '../positioner/TooltipPositioner.tsx';
import { useTooltipRootContext } from '../root/TooltipRootContext.ts';
import type { TooltipInstantType } from '../store/TooltipStore.ts';

export interface TooltipArrowState {
  open: boolean;
  side: Side;
  align: Align;
  uncentered: boolean;
  /** Why transitions are skipped, if they are. */
  instant: TooltipInstantType;
}

export interface TooltipArrowProps extends BaseUIComponentProps<'div', TooltipArrowState> {}

export function TooltipArrow(componentProps: TooltipArrowProps): JSX.Element {
  const { store } = useTooltipRootContext();
  const positioner = useTooltipPositionerContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: TooltipArrowState = {
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
    get instant() {
      return store.instantType();
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
