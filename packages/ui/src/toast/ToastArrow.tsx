// Upstream: packages/react/src/toast/arrow/ToastArrow.tsx,
// packages/react/src/toast/arrow/ToastArrowDataAttributes.ts
//
// Displays an element positioned against the toast anchor, inside a
// `Toast.Positioner`. Renders a `<div>` element.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import type { Align, Side } from '../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { CommonPopupDataAttributes } from '../utils/popupStateMapping.ts';
import { useToastPositionerContext } from './ToastPositioner.tsx';

export const ToastArrowDataAttributes = {
  /** Indicates which side the toast is positioned relative to the anchor. */
  side: CommonPopupDataAttributes.side,
  /** Indicates how the toast is aligned relative to the specified side. */
  align: CommonPopupDataAttributes.align,
  /** Present when the toast arrow is uncentered. */
  uncentered: 'data-uncentered',
} as const;

export interface ToastArrowState {
  /** The side of the anchor the component is placed on. */
  side: Side;
  /** The alignment of the component relative to the anchor. */
  align: Align;
  /** Whether the arrow cannot be centered on the anchor. */
  uncentered: boolean;
}

export interface ToastArrowProps extends BaseUIComponentProps<'div', ToastArrowState> {}

export function ToastArrow(props: ToastArrowProps): JSX.Element {
  const { setArrowElement, side, align, arrowUncentered, arrowStyles } =
    useToastPositionerContext();

  const state: ToastArrowState = {
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get uncentered() {
      return arrowUncentered();
    },
  };

  return useRenderElement('div', props, {
    state,
    ref: setArrowElement,
    props: [
      {
        get style() {
          return arrowStyles();
        },
        'aria-hidden': 'true',
      },
      omit(props, 'class', 'style', 'render'),
    ],
  });
}
