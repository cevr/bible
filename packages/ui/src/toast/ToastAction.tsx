// Upstream: packages/react/src/toast/action/ToastAction.tsx
//
// Performs an action when clicked. Its props merge with the toast's
// `actionProps` (whose `children` is the label, ahead of the part's own);
// with no label it renders nothing. Renders a `<button>` element.
import type { JSX } from '@solidjs/web';
import { children, createMemo, omit, Show } from 'solid-js';

import { useButton } from '../internals/useButton.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import { propsFromAccessor, useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';
import { isRenderableNode } from './utils.ts';

interface ToastActionState {
  /** The type of the toast. */
  type: string | undefined;
}

interface ToastActionProps extends BaseUIComponentProps<'button', ToastActionState> {}

export function ToastAction(props: ToastActionProps): JSX.Element {
  const { toast } = useToastRootContext();

  const content = children(() => toast().actionProps?.children ?? props.children);
  const shouldRender = createMemo(() => isRenderableNode(content()));

  const { getButtonProps } = useButton();

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
      state,
      props: [
        omit(props, 'class', 'style', 'render', 'children'),
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
