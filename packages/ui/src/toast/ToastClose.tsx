// Upstream: packages/react/src/toast/close/ToastClose.tsx
//
// Closes the toast when clicked. Always exposed to assistive technology: the
// receipts draw it visible at rest, so upstream's `aria-hidden` while the
// stack is collapsed is left out. Renders a `<button>` element.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { useButton } from '../internals/useButton.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastProviderContext } from './ToastProviderContext.ts';
import { useToastRootContext } from './ToastRootContext.ts';

export interface ToastCloseState {
  /** The type of the toast. */
  type: string | undefined;
}

export interface ToastCloseProps extends BaseUIComponentProps<'button', ToastCloseState> {}

export function ToastClose(props: ToastCloseProps): JSX.Element {
  const { store } = useToastProviderContext();
  const { toast } = useToastRootContext();

  const { getButtonProps } = useButton();

  const state: ToastCloseState = {
    get type() {
      return toast().type;
    },
  };

  return useRenderElement('button', props, {
    state,
    props: [
      {
        onClick() {
          store.closeToast(untrack(toast).id);
        },
      },
      omit(props, 'class', 'style', 'render'),
      getButtonProps,
    ],
  });
}
