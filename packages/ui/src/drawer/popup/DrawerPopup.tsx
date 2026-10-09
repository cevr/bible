// Upstream: packages/react/src/drawer/popup/DrawerPopup.tsx
//
// The drawer's `role="dialog"` container. It focuses itself on open (not
// its first field, so no virtual keyboard opens) and keeps focus inside like
// a dialog's popup.
//
// Its swipe arrives as CSS variables for the consumer's transform:
// `--drawer-swipe-movement-x/y` while dragged.
import type { JSX } from '@solidjs/web';
import { createEffect, omit, untrack } from 'solid-js';

import { DialogPopupFocus, dialogPopupProps } from '../../dialog/popup/DialogPopup.tsx';
import { useDialogPortalContext } from '../../dialog/portal/DialogPortal.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { type DrawerSwipeDirection, useDrawerRootContext } from '../root/DrawerRootContext.ts';
import { DrawerPopupCssVars, DrawerPopupDataAttributes } from '../utils/drawerAttributes.ts';
import { useDrawerViewportContext } from '../viewport/DrawerViewportContext.ts';

let swipeVarsRegistered = false;

/**
 * Registers the high-frequency swipe variables as non-inherited, so a drag
 * does not restyle the popup's whole subtree on every move. Nothing inside
 * the drawer reads them.
 */
function registerSwipeVars() {
  if (swipeVarsRegistered) {
    return;
  }
  swipeVarsRegistered = true;
  if (typeof CSS === 'undefined' || !('registerProperty' in CSS)) {
    return;
  }
  const properties = [
    { name: DrawerPopupCssVars.swipeMovementX, syntax: '<length>', initialValue: '0px' },
    { name: DrawerPopupCssVars.swipeMovementY, syntax: '<length>', initialValue: '0px' },
  ];
  for (const property of properties) {
    try {
      CSS.registerProperty({ ...property, inherits: false });
    } catch {
      // Already registered.
    }
  }
}

export interface DrawerPopupState {
  open: boolean;
  transitionStatus: TransitionStatus;
  /** The direction a swipe dismisses the drawer in. */
  swipeDirection: DrawerSwipeDirection;
  /** Whether the drawer is being swiped. */
  swiping: boolean;
}

export interface DrawerPopupProps extends BaseUIComponentProps<'div', DrawerPopupState> {
  /**
   * What takes focus on open, read as the drawer opens: an element, `false`
   * for nothing, `true` for the first tabbable element. The popup itself by
   * default.
   */
  initialFocus?: (() => HTMLElement | boolean) | undefined;
}

const SWIPING_HOOK = { [DrawerPopupDataAttributes.swiping]: '' };

const drawerPopupStateAttributesMapping: StateAttributesMapping<DrawerPopupState> = {
  ...popupTransitionStateMapping,
  swipeDirection: (value) => ({ [DrawerPopupDataAttributes.swipeDirection]: value }),
  swiping: (value) => (value ? SWIPING_HOOK : null),
};

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 */
export function DrawerPopup(componentProps: DrawerPopupProps): JSX.Element {
  const { store, popupProps } = useDialogRootContext();
  const drawer = useDrawerRootContext();
  const swipe = useDrawerViewportContext();
  useDialogPortalContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'initialFocus', 'id');

  onClientCleanup(() => store.setPopupElement(null));

  createEffect(store.popupElement, (popup) => {
    if (popup) {
      registerSwipeVars();
    }
  });

  const state: DrawerPopupState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
    get swipeDirection() {
      return drawer.swipeDirection();
    },
    get swiping() {
      return swipe.swiping();
    },
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: drawerPopupStateAttributesMapping,
      props: [
        popupProps,
        dialogPopupProps(store, componentProps),
        {
          get style() {
            return swipe.getDragStyles();
          },
        },
        elementProps,
      ],
    });

  return (
    <DialogPopupFocus
      store={store}
      initialFocus={
        componentProps.initialFocus === undefined
          ? () => untrack(store.popupElement) ?? true
          : componentProps.initialFocus
      }
    >
      {untrack(element)}
    </DialogPopupFocus>
  );
}
