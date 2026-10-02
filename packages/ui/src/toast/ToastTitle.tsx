// Upstream: packages/react/src/toast/title/ToastTitle.tsx,
// packages/react/src/toast/title/ToastTitleDataAttributes.ts
//
// A title that labels the toast: its children, else the toast's `title`.
// Renders an `<h2>` element, and nothing when there is no content.
import type { JSX } from '@solidjs/web';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { ToastLabelPart, type ToastLabelState } from './useToastLabelPart.tsx';

export const ToastTitleDataAttributes = {
  /** The type of the toast. */
  type: 'data-type',
} as const;

export type ToastTitleState = ToastLabelState;

export interface ToastTitleProps extends BaseUIComponentProps<'h2', ToastTitleState> {}

export function ToastTitle(props: ToastTitleProps): JSX.Element {
  return ToastLabelPart(props, 'h2', 'title');
}
