// Upstream: packages/react/src/toast/title/ToastTitle.tsx,
// packages/react/src/toast/utils/useToastLabelPart.ts
//
// A title that labels the toast: its children, else the toast's `title`.
// Renders an `<h2>` element, and nothing when there is no content; while it
// renders, its id is the root's `aria-labelledby`.
import type { JSX } from '@solidjs/web';
import { children, createEffect, createMemo, createUniqueId, omit, Show } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';
import { isRenderableNode } from './utils.ts';

interface ToastTitleState {
  /** The type of the toast. */
  type: string | undefined;
}

interface ToastTitleProps extends BaseUIComponentProps<'h2', ToastTitleState> {}

export function ToastTitle(props: ToastTitleProps): JSX.Element {
  const root = useToastRootContext();
  const generatedId = createUniqueId();
  const id = () => (typeof props.id === 'string' ? props.id : generatedId);

  const content = children(() => (props.children != null ? props.children : root.toast().title));
  const shouldRender = createMemo(() => isRenderableNode(content()));

  createEffect(
    () => [shouldRender(), id()] as const,
    ([render, currentId]) => {
      if (!render) {
        return undefined;
      }
      root.setTitleId(() => currentId);
      return () => {
        root.setTitleId((registered) => (registered === currentId ? undefined : registered));
      };
    },
  );

  const state: ToastTitleState = {
    get type() {
      return root.toast().type;
    },
  };

  function TitleElement() {
    return useRenderElement('h2', props, {
      state,
      props: [
        omit(props, 'class', 'style', 'render', 'id', 'children'),
        {
          get id() {
            return id();
          },
          get children() {
            return content();
          },
        },
      ],
    });
  }

  return (
    <Show when={shouldRender()}>
      <TitleElement />
    </Show>
  );
}
