// Upstream: packages/react/src/dialog/viewport/DialogViewport.tsx
//
// A positioning container around a dialog's popup that can be made
// scrollable (a tall dialog scrolls inside it, not the page). It renders
// inside the portal, so while the dialog is mounted, and lets pointer events
// through once the dialog closes. Only `Drawer.Viewport` renders it; upstream's
// `Dialog.Viewport` part is left out, since no page draws one.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

export interface DialogViewportState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

export interface DialogViewportProps extends BaseUIComponentProps<'div', DialogViewportState> {}

/** Renders the viewport with `internalProps` merged under the user's (a drawer's swipe handlers). */
export function renderDialogViewport(
  componentProps: DialogViewportProps,
  internalProps?: HTMLProps,
): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  onClientCleanup(() => store.setViewportElement(null));

  const state: DialogViewportState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: (el: HTMLElement) => store.setViewportElement(el),
    stateAttributesMapping: popupTransitionStateMapping,
    props: [
      {
        role: 'presentation',
        get style() {
          return { 'pointer-events': store.open() ? undefined : 'none' };
        },
      },
      internalProps,
      elementProps,
    ],
  });
}
