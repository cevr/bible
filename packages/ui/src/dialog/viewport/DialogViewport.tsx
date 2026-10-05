// Upstream: packages/react/src/dialog/viewport/DialogViewport.tsx
//
// A positioning container around the dialog's popup that can be made
// scrollable (a tall dialog scrolls inside it, not the page). It renders
// while the dialog is mounted, or always in a `keepMounted` portal, and lets
// pointer events through once the dialog closes.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { useDialogPortalContext } from '../portal/DialogPortal.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';
import { dialogStateAttributesMapping } from '../utils/stateAttributesMapping.ts';

export interface DialogViewportState {
  open: boolean;
  transitionStatus: TransitionStatus;
  /** Whether the dialog is nested within another dialog. */
  nested: boolean;
  /** Whether a dialog nested in this one is open. */
  nestedDialogOpen: boolean;
}

export interface DialogViewportProps extends BaseUIComponentProps<'div', DialogViewportState> {}

/** Renders the viewport with `internalProps` merged under the user's (a drawer's swipe handlers). */
export function renderDialogViewport(
  componentProps: DialogViewportProps,
  internalProps?: HTMLProps,
  options: { suppressNestedDialogOpen?: boolean } = {},
): JSX.Element {
  const { store } = useDialogRootContext();
  const keepMounted = useDialogPortalContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  onClientCleanup(() => store.setViewportElement(null));

  const state: DialogViewportState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
    nested: store.nested,
    get nestedDialogOpen() {
      return !options.suppressNestedDialogOpen && store.nestedOpenDialogCount() > 0;
    },
  };

  return useRenderElement('div', componentProps, {
    get enabled() {
      return keepMounted() || store.mounted();
    },
    state,
    ref: (el: HTMLElement) => store.setViewportElement(el),
    stateAttributesMapping: dialogStateAttributesMapping,
    props: [
      {
        role: 'presentation',
        get hidden() {
          return !store.mounted() || undefined;
        },
        get style() {
          return { 'pointer-events': store.open() ? undefined : 'none' };
        },
      },
      internalProps,
      elementProps,
    ],
  });
}

/**
 * A positioning container for the dialog popup that can be made scrollable.
 * Renders a `<div>` element.
 */
export function DialogViewport(componentProps: DialogViewportProps): JSX.Element {
  return renderDialogViewport(componentProps);
}
