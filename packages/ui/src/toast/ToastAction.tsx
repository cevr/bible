// Upstream: packages/react/src/toast/action/ToastAction.tsx
//
// Performs an action when clicked. Its props merge with the toast's
// `actionProps` (whose `children` is the label, ahead of the part's own);
// with no label it renders nothing. Renders a `<button>` element.
import type { JSX } from '@solidjs/web';
import { children, createMemo, omit, Show } from 'solid-js';

import { useButton } from '../internals/useButton.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../internals/types.ts';
import { propsFromAccessor, useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';
import { isRenderableNode } from './utils.ts';

export interface ToastActionState {
  /** The type of the toast. */
  type: string | undefined;
}

export interface ToastActionProps
  extends NativeButtonProps, BaseUIComponentProps<'button', ToastActionState> {}

export function ToastAction(props: ToastActionProps): JSX.Element {
  const { toast } = useToastRootContext();

  const content = children(() => toast().actionProps?.children ?? props.children);
  const shouldRender = createMemo(() => isRenderableNode(content()));

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return Boolean(props.disabled);
    },
    get native() {
      return props.nativeButton ?? true;
    },
  });

  const state: ToastActionState = {
    get type() {
      return toast().type;
    },
  };

  const actionProps = propsFromAccessor(() => {
    const { children: _children, ...rest } = toast().actionProps ?? {};
    return rest;
  });

  function ActionElement() {
    return useRenderElement('button', props, {
      ref: buttonRef,
      state,
      props: [
        omit(props, 'class', 'style', 'render', 'disabled', 'nativeButton', 'children'),
        actionProps,
        getButtonProps,
        {
          get children() {
            return content();
          },
        },
      ],
    });
  }

  return (
    <Show when={shouldRender()}>
      <ActionElement />
    </Show>
  );
}
