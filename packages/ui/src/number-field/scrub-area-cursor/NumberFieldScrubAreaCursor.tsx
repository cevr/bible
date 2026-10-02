// Upstream: packages/react/src/number-field/scrub-area-cursor/NumberFieldScrubAreaCursor.tsx
//
// The element shown in place of the hidden cursor while a mouse scrubs under
// pointer lock, portalled to the body and moved by the scrub area. Not
// rendered for touch, when pointer lock is refused, or in WebKit (which
// scrubs without the lock).
// Renders a `<span>`.
import { type JSX, Portal } from '@solidjs/web';
import { omit, onCleanup, Show } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { ownerDocument } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext.ts';
import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import { useNumberFieldScrubAreaContext } from '../scrub-area/NumberFieldScrubAreaContext.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';

const CURSOR_STYLE: JSX.CSSProperties = {
  position: 'fixed',
  top: '0',
  left: '0',
  'pointer-events': 'none',
};

export interface NumberFieldScrubAreaCursorState extends NumberFieldRootState {}

export interface NumberFieldScrubAreaCursorProps extends BaseUIComponentProps<
  'span',
  NumberFieldScrubAreaCursorState
> {}

export function NumberFieldScrubAreaCursor(
  componentProps: NumberFieldScrubAreaCursorProps,
): JSX.Element {
  const { state, inputElement } = useNumberFieldRootContext();
  const scrubArea = useNumberFieldScrubAreaContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  const shouldRender = () =>
    scrubArea.isScrubbing &&
    !platform.engine.webkit &&
    !scrubArea.isTouchInput &&
    !scrubArea.isPointerLockDenied;

  function CursorElement() {
    onCleanup(() => {
      scrubArea.scrubAreaCursorRef.current = null;
    });
    return useRenderElement('span', componentProps, {
      state,
      ref: (element: HTMLSpanElement | null) => {
        scrubArea.scrubAreaCursorRef.current = element;
      },
      props: [{ role: 'presentation', style: CURSOR_STYLE }, elementProps],
      stateAttributesMapping,
    });
  }

  return (
    <Show when={shouldRender()}>
      <Portal mount={ownerDocument(inputElement()).body}>
        <CursorElement />
      </Portal>
    </Show>
  );
}

export namespace NumberFieldScrubAreaCursor {
  export type State = NumberFieldScrubAreaCursorState;
  export type Props = NumberFieldScrubAreaCursorProps;
}
