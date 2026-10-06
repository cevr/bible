// Upstream: packages/react/src/menu/popup/MenuPopup.tsx
//
// The menu's `role="menu"` container. Focus moves into it on open (the menu
// focuses itself, or the item list navigation highlights) and back to the
// trigger on close; a context menu traps focus.
import { isServer, type JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import {
  FloatingFocusManager,
  type InteractionType,
} from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useMenuPositionerContext } from '../positioner/MenuPositioner.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuInstantType } from '../store/MenuStore.ts';

export interface MenuPopupState {
  transitionStatus: TransitionStatus;
  side: Side;
  align: Align;
  open: boolean;
  instant: MenuInstantType;
}

export interface MenuPopupProps extends BaseUIComponentProps<'div', MenuPopupState> {
  /**
   * What takes focus when the menu closes: `false` nothing, `true` the
   * default (the trigger), an element, or a function of how it closed.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
}

export function MenuPopup(componentProps: MenuPopupProps): JSX.Element {
  const { store, parent, popupProps, orientation } = useMenuRootContext();
  const { side, align } = useMenuPositionerContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'finalFocus', 'id');
  const isContextMenu = parent.type === 'context-menu';

  useOpenChangeComplete({
    open: store.open,
    element: store.popupElement,
    onComplete() {
      if (untrack(store.open)) {
        store.onOpenChangeComplete(true);
      }
    },
  });

  // The server set no element to let go.
  onCleanup(() => {
    if (!isServer) store.setPopupElement(null);
  });

  const state: MenuPopupState = {
    get transitionStatus() {
      return store.transitionStatus();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
    get open() {
      return store.open();
    },
    get instant() {
      return store.instantType();
    },
  };

  // A thunk, built under the providers below so its children read them.
  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: popupTransitionStateMapping,
      props: [
        popupProps,
        {
          get id() {
            return componentProps.id ?? store.floatingId;
          },
          role: 'menu',
          // `menu` is vertical unless it says otherwise.
          get 'aria-orientation'() {
            return orientation() === 'horizontal' ? 'horizontal' : undefined;
          },
          get 'aria-labelledby'() {
            if (componentProps['aria-labelledby'] != null || componentProps['aria-label']) {
              return componentProps['aria-labelledby'];
            }
            return store.activeTriggerElement()?.id || store.activeTriggerId() || undefined;
          },
          get style() {
            return store.transitionStatus() === 'starting' ? { transition: 'none' } : undefined;
          },
        },
        elementProps,
        {
          get 'data-rootownerid'() {
            return store.rootId();
          },
        },
      ],
    });

  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      openInteractionType={store.openMethod()}
      modal={isContextMenu}
      disabled={!store.mounted()}
      returnFocus={componentProps.finalFocus ?? true}
      initialFocus
      restoreFocus
      getInsideElements={
        parent.type === undefined ? () => [store.beforeTriggerFocusGuardRef.current] : undefined
      }
      previousFocusableElement={store.activeTriggerElement() as HTMLElement | null}
      nextFocusableElement={parent.type === undefined ? store.triggerFocusTargetRef : undefined}
      beforeContentFocusGuardRef={store.beforeContentFocusGuardRef}
    >
      {untrack(element)}
    </FloatingFocusManager>
  );
}
