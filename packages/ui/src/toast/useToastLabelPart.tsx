// Upstream: packages/react/src/toast/utils/useToastLabelPart.ts
//
// What `Toast.Title` and `Toast.Description` share: the content (the
// part's children, else the toast's title or description), rendered only
// when there is something to show, and the generated id registered with
// the root (its `aria-labelledby` / `aria-describedby`) while it renders.
import type { JSX } from '@solidjs/web';
import { children, createEffect, createMemo, createUniqueId, omit, Show } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { type IntrinsicTagName, useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';
import { isRenderableNode } from './utils.ts';

export interface ToastLabelState {
  /** The type of the toast. */
  type: string | undefined;
}

export function ToastLabelPart(
  props: BaseUIComponentProps<'h2' | 'p', ToastLabelState>,
  tag: IntrinsicTagName,
  part: 'title' | 'description',
): JSX.Element {
  const root = useToastRootContext();
  const setId = part === 'title' ? root.setTitleId : root.setDescriptionId;
  const generatedId = createUniqueId();
  const id = () => (typeof props.id === 'string' ? props.id : generatedId);

  const content = children(() => {
    if (props.children != null) {
      return props.children;
    }
    const toast = root.toast();
    return part === 'title' ? toast.title : toast.description;
  });
  const shouldRender = createMemo(() => isRenderableNode(content()));

  createEffect(
    () => [shouldRender(), id()] as const,
    ([render, currentId]) => {
      if (!render) {
        return undefined;
      }
      setId(() => currentId);
      return () => {
        setId((registered) => (registered === currentId ? undefined : registered));
      };
    },
  );

  const state: ToastLabelState = {
    get type() {
      return root.toast().type;
    },
  };

  function LabelElement() {
    return useRenderElement(tag, props, {
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
      <LabelElement />
    </Show>
  );
}
