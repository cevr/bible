// Upstream: packages/react/src/toast/description/ToastDescription.tsx,
// packages/react/src/toast/description/ToastDescriptionDataAttributes.ts
//
// A description that describes the toast: its children, else the toast's
// `description`. Renders a `<p>` element, and nothing when there is no content.
import type { JSX } from '@solidjs/web';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { ToastLabelPart, type ToastLabelState } from './useToastLabelPart.tsx';

export const ToastDescriptionDataAttributes = {
  /** The type of the toast. */
  type: 'data-type',
} as const;

export type ToastDescriptionState = ToastLabelState;

export interface ToastDescriptionProps extends BaseUIComponentProps<'p', ToastDescriptionState> {}

export function ToastDescription(props: ToastDescriptionProps): JSX.Element {
  return ToastLabelPart(props, 'p', 'description');
}
