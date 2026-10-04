// Upstream: packages/react/src/drawer/backdrop/DrawerBackdrop.tsx
//
// An overlay under the drawer's popup. Only the outermost drawer of a
// nested stack renders one, unless `forceRender`. While the drawer is
// swiped it carries `data-swiping` and `--drawer-swipe-progress` (0 at
// rest, toward 1 as the drawer leaves), for a fade that follows the finger.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup } from 'solid-js';

import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { DrawerBackdropCssVars, DrawerPopupCssVars } from '../utils/drawerAttributes.ts';

export interface DrawerBackdropState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

export interface DrawerBackdropProps extends BaseUIComponentProps<'div', DrawerBackdropState> {
  /** Whether the backdrop renders even in a nested drawer. @default false */
  forceRender?: boolean | undefined;
}

/**
 * An overlay displayed beneath the popup.
 * Renders a `<div>` element.
 */
export function DrawerBackdrop(componentProps: DrawerBackdropProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'forceRender');

  onCleanup(() => {
    store.backdropRef.current = null;
  });

  const state: DrawerBackdropState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  return useRenderElement('div', componentProps, {
    get enabled() {
      return (componentProps.forceRender ?? false) || !store.nested;
    },
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
        get style() {
          return {
            'pointer-events': store.open() ? undefined : 'none',
            'user-select': 'none',
            '-webkit-user-select': 'none',
            [DrawerBackdropCssVars.swipeProgress]: '0',
            [DrawerPopupCssVars.swipeStrength]: '1',
          };
        },
      },
      elementProps,
    ],
  });
}
