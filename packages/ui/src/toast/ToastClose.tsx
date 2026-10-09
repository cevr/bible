// Upstream: packages/react/src/toast/close/ToastClose.tsx
//
// Closes the toast when clicked. Hidden from assistive technology while the
// stack is collapsed, unless it has focus. Renders a `<button>` element.
import type { JSX } from '@solidjs/web';
import { createSignal, omit, untrack } from 'solid-js';

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
  const { toast, expanded } = useToastRootContext();
  const [hasFocus, setHasFocus] = createSignal(false);

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
        get 'aria-hidden'() {
          return !expanded() && !hasFocus() ? 'true' : 'false';
        },
        onClick() {
          store.closeToast(untrack(toast).id);
        },
        onFocus() {
          setHasFocus(true);
        },
        onBlur() {
          setHasFocus(false);
        },
      },
      omit(props, 'class', 'style', 'render'),
      getButtonProps,
    ],
  });
}
