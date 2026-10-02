// Upstream: packages/react/src/toast/content/ToastContent.tsx,
// packages/react/src/toast/content/ToastContentDataAttributes.ts
//
// A container for the contents of a toast. When its size or content
// changes, the root re-measures the toast's height. Renders a `<div>`
// element, `data-behind` when the toast is behind the frontmost one.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';

export const ToastContentDataAttributes = {
  /** Present when the toast viewport is expanded. */
  expanded: 'data-expanded',
  /** Present when the toast is behind the frontmost toast in the stack. */
  behind: 'data-behind',
} as const;

export interface ToastContentState {
  /** Whether the toast viewport is expanded. */
  expanded: boolean;
  /** Whether the toast is behind the frontmost toast in the stack. */
  behind: boolean;
}

export interface ToastContentProps extends BaseUIComponentProps<'div', ToastContentState> {}

export function ToastContent(props: ToastContentProps): JSX.Element {
  const { visibleIndex, expanded, recalculateHeight } = useToastRootContext();
  const [contentElement, setContentElement] = createSignal<HTMLDivElement | null>(null, {
    ownedWrite: true,
  });

  createEffect(contentElement, (node) => {
    if (!node) {
      return undefined;
    }
    recalculateHeight();

    if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => recalculateHeight());
    const mutationObserver = new MutationObserver(() => recalculateHeight());

    resizeObserver.observe(node);
    mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  });

  const state: ToastContentState = {
    get expanded() {
      return expanded();
    },
    get behind() {
      return visibleIndex() > 0;
    },
  };

  return useRenderElement('div', props, {
    ref: (node: HTMLDivElement) => setContentElement(node),
    state,
    props: omit(props, 'class', 'style', 'render'),
  });
}
