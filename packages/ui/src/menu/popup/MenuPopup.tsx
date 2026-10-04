// Upstream: packages/react/src/menu/popup/MenuPopup.tsx
//
// The menu's `role="menu"` container. Focus moves into it on open (a top
// level menu focuses itself, or the item list navigation highlights) and
// back to the trigger on close; a context menu traps focus. Leaving a
// hover-opened menu with the pointer closes it, through the safe polygon
// toward a submenu. An item press anywhere in the tree closes the menu.
// Inside a toolbar, the composite navigation keys stop at the popup, so they
// move through the menu and not the toolbar's focus.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import {
  FloatingFocusManager,
  type InteractionType,
} from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { useHoverFloatingInteraction } from '../../floating-ui-solid/hooks/useHoverFloatingInteraction.ts';
import { COMPOSITE_KEYS } from '../../internals/composite/composite.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useToolbarRootContext } from '../../toolbar/ToolbarRootContext.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useMenuPositionerContext } from '../positioner/MenuPositioner.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuChangeEventReason, MenuInstantType } from '../store/MenuStore.ts';

export interface MenuPopupState {
  transitionStatus: TransitionStatus;
  side: Side;
  align: Align;
  open: boolean;
  /** Whether the menu is a submenu. */
  nested: boolean;
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
  const insideToolbar = useToolbarRootContext(true) != null;

  useOpenChangeComplete({
    open: store.open,
    element: store.popupElement,
    onComplete() {
      if (untrack(store.open)) {
        store.onOpenChangeComplete(true);
      }
    },
  });

  const handleClose = (event: { domEvent: Event | undefined; reason: MenuChangeEventReason }) => {
    store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
  };
  const events = store.floatingTreeRoot.events;
  events.on('close', handleClose);
  onCleanup(() => {
    events.off('close', handleClose);
    store.setPopupElement(null);
  });

  useHoverFloatingInteraction(store.floatingRootContext, {
    get enabled() {
      return store.hoverEnabled() && !store.disabled() && !isContextMenu;
    },
    closeDelay: () => store.closeDelay(),
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
    nested: parent.type === 'menu',
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
          onKeyDown(event: KeyboardEvent) {
            // Arrow keys inside the popup stay there, not moving a toolbar's focus.
            if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
              event.stopPropagation();
            }
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

  const returnFocus = () => {
    if (componentProps.finalFocus !== undefined) {
      return componentProps.finalFocus;
    }
    return parent.type === undefined || isContextMenu || store.activeTriggerElement() != null;
  };

  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      openInteractionType={store.openMethod()}
      modal={isContextMenu}
      disabled={!store.mounted()}
      returnFocus={returnFocus()}
      initialFocus={parent.type !== 'menu'}
      restoreFocus
      getInsideElements={
        parent.type === undefined ? () => [store.beforeTriggerFocusGuardRef.current] : undefined
      }
      externalTree={store.floatingTreeRoot}
      previousFocusableElement={store.activeTriggerElement() as HTMLElement | null}
      nextFocusableElement={parent.type === undefined ? store.triggerFocusTargetRef : undefined}
      beforeContentFocusGuardRef={store.beforeContentFocusGuardRef}
    >
      {untrack(element)}
    </FloatingFocusManager>
  );
}
