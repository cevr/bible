// Upstream: packages/react/src/toast/content/ToastContent.tsx
//
// A container for the contents of a toast. Upstream's re-measuring of the
// toast's height when the content changes is left out with the height.
// Renders a `<div>` element, `data-behind` when the toast is behind the
// frontmost one.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';

interface ToastContentState {
  /** Whether the toast viewport is expanded. */
  expanded: boolean;
  /** Whether the toast is behind the frontmost toast in the stack. */
  behind: boolean;
}

interface ToastContentProps extends BaseUIComponentProps<'div', ToastContentState> {}

export function ToastContent(props: ToastContentProps): JSX.Element {
  const { visibleIndex, expanded } = useToastRootContext();

  const state: ToastContentState = {
    get expanded() {
      return expanded();
    },
    get behind() {
      return visibleIndex() > 0;
    },
  };

  return useRenderElement('div', props, {
    state,
    props: omit(props, 'class', 'style', 'render'),
  });
}
