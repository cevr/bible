// Upstream: packages/react/src/dialog/backdrop/DialogBackdrop.tsx
//
// An overlay under the dialog's popup. A press on it is an outside press of
// its own dialog only.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup } from 'solid-js';

import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

interface DialogBackdropState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

interface DialogBackdropProps extends BaseUIComponentProps<'div', DialogBackdropState> {}

/**
 * An overlay displayed beneath the popup.
 * Renders a `<div>` element.
 */
export function DialogBackdrop(componentProps: DialogBackdropProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  onCleanup(() => {
    store.backdropRef.current = null;
  });

  const state: DialogBackdropState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: (el: HTMLElement) => {
      store.backdropRef.current = el;
    },
    stateAttributesMapping: popupTransitionStateMapping,
    props: [
      {
        role: 'presentation',
        get hidden() {
          return !store.mounted() || undefined;
        },
        style: { 'user-select': 'none', '-webkit-user-select': 'none' },
      },
      elementProps,
    ],
  });
}
