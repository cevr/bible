// Upstream: packages/react/src/menu/arrow/MenuArrow.tsx,
// packages/react/src/menu/backdrop/MenuBackdrop.tsx
//
// The arrow pointing from the popup to its anchor (placed by the positioner,
// `data-uncentered` when it cannot point at the anchor's center), and an
// optional backdrop under the menu, which ignores the pointer when the menu
// was opened by hover.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupStateMapping, popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useMenuPositionerContext } from '../positioner/MenuPositioner.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

export interface MenuArrowState {
  open: boolean;
  side: Side;
  align: Align;
  uncentered: boolean;
}

export interface MenuArrowProps extends BaseUIComponentProps<'div', MenuArrowState> {}

export function MenuArrow(componentProps: MenuArrowProps): JSX.Element {
  const { store } = useMenuRootContext();
  const positioner = useMenuPositionerContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: MenuArrowState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get uncentered() {
      return positioner.arrowUncentered();
    },
  };
  return useRenderElement('div', componentProps, {
    ref: (el: HTMLElement) => positioner.setArrowElement(el),
    stateAttributesMapping: popupStateMapping,
    state,
    props: [
      {
        get style() {
          return positioner.arrowStyles();
        },
        'aria-hidden': 'true',
      },
      elementProps,
    ],
  });
}

export interface MenuBackdropState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

export interface MenuBackdropProps extends BaseUIComponentProps<'div', MenuBackdropState> {}

export function MenuBackdrop(componentProps: MenuBackdropProps): JSX.Element {
  const { store } = useMenuRootContext();
  const contextMenu = useContextMenuRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: MenuBackdropState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };
  return useRenderElement('div', componentProps, {
    ref: (el: HTMLElement) => {
      if (contextMenu) {
        contextMenu.backdropRef.current = el;
      }
    },
    state,
    stateAttributesMapping: popupTransitionStateMapping,
    props: [
      {
        role: 'presentation',
        get hidden() {
          return !store.mounted() || undefined;
        },
        get style() {
          return {
            'pointer-events':
              store.lastOpenChangeReason() === REASONS.triggerHover ? 'none' : undefined,
            'user-select': 'none',
            '-webkit-user-select': 'none',
          };
        },
      },
      elementProps,
    ],
  });
}
