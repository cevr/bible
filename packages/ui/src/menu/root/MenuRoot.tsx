// Upstream: packages/react/src/menu/root/MenuRoot.tsx
//
// Groups a menu's parts and owns its state. Opening and closing go through
// one pipeline: `onOpenChange` (which may cancel), then the interactions
// hear of it, then the menu records why it changed and whether its
// transition is skipped. The root wires the interactions the parts share:
// Escape and outside presses, arrow-key navigation, typeahead, and how it
// was opened. A menu is vertical, modal, wraps its arrow keys and opens
// only from its trigger. Upstream's hover opening and submenus are left
// out: each menu, a context menu included, is the only menu of its tree.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, untrack } from 'solid-js';

import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import { useDismiss } from '../../floating-ui-solid/hooks/useDismiss.ts';
import { useListNavigation } from '../../floating-ui-solid/hooks/useListNavigation.ts';
import { useTypeahead } from '../../floating-ui-solid/hooks/useTypeahead.ts';
import { TYPEAHEAD_RESET_MS } from '../../internals/constants.ts';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { mergeProps } from '../../merge-props/mergeProps.ts';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useOpenInteractionType } from '../../utils/useOpenInteractionType.ts';
import {
  createMenuStore,
  type MenuChangeEventDetails,
  type MenuChangeEventReason,
  type MenuInstantType,
  type MenuParent,
} from '../store/MenuStore.ts';
import { isKeyboardClick } from '../utils/isKeyboardOpen.ts';
import { MenuRootContext, useMenuRootContextOptional } from './MenuRootContext.ts';

export type { MenuChangeEventDetails, MenuChangeEventReason };

export interface MenuRootProps {
  onOpenChange?: ((open: boolean, eventDetails: MenuChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  children?: JSX.Element;
}

/**
 * Groups all parts of the menu.
 * Doesn't render its own HTML element.
 */
export function MenuRoot(props: MenuRootProps): JSX.Element {
  const contextMenuContext = useContextMenuRootContext();
  const enclosingStore = useMenuRootContextOptional()?.store;

  const parent: MenuParent =
    contextMenuContext && !enclosingStore
      ? { type: 'context-menu', context: contextMenuContext }
      : { type: undefined };

  const rootId = createUniqueId();
  const floatingId = createUniqueId();

  let openRead = () => false;
  const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(() =>
    openRead(),
  );

  const store = createMenuStore({
    parent,
    openMethod,
    floatingId,
    rootId,
    onOpenChange: setOpen,
    onOpenChangeComplete: () => props.onOpenChangeComplete,
  });
  openRead = store.open;

  const floatingRootContext = store.floatingRootContext;

  let openEvent: Event | null = null;
  let allowOutsidePressDismissal = parent.type !== 'context-menu';
  const allowOutsidePressDismissalTimeout = useTimeout();

  createEffect(store.open, (isOpen) => {
    if (!isOpen) {
      openEvent = null;
    }
    if (parent.type !== 'context-menu') {
      return;
    }
    if (!isOpen) {
      allowOutsidePressDismissalTimeout.clear();
      allowOutsidePressDismissal = false;
      return;
    }
    // A long press or a right-click's own mousedown must not close the menu it just opened.
    allowOutsidePressDismissalTimeout.start(500, () => {
      allowOutsidePressDismissal = true;
    });
  });

  function setOpen(nextOpen: boolean, eventDetails: BaseUIChangeEventDetails) {
    const reason = eventDetails.reason as MenuChangeEventReason;
    const isOpen = untrack(store.open);
    // A trigger's cancel-open can ask a closed menu to close.
    if (!nextOpen && !isOpen) {
      return;
    }
    const activeTriggerElement = untrack(store.activeTriggerElement);
    if (
      isOpen === nextOpen &&
      eventDetails.trigger === activeTriggerElement &&
      untrack(store.lastOpenChangeReason) === reason
    ) {
      return;
    }
    const details = eventDetails as MenuChangeEventDetails;
    // The trigger stays active while closing, so the exit animates from it and focus returns to it.
    if (!nextOpen && eventDetails.trigger == null) {
      eventDetails.trigger = activeTriggerElement ?? undefined;
    }

    untrack(() => props.onOpenChange)?.(nextOpen, details);
    if (eventDetails.isCanceled) {
      return;
    }
    floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

    const nativeEvent = eventDetails.event;
    const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);
    openEvent = nativeEvent;

    let instantType: MenuInstantType;
    if (isKeyboardClick(reason, nativeEvent)) {
      instantType = 'click';
    } else if (isDismissClose) {
      instantType = 'dismiss';
    }

    store.applyMenuOpenState(nextOpen, eventDetails, { reason, instantType });
  }

  const dismiss = useDismiss(floatingRootContext, {
    outsidePress() {
      if (parent.type !== 'context-menu' || openEvent?.type === 'contextmenu') {
        return true;
      }
      return allowOutsidePressDismissal;
    },
  });

  const listNavigation = useListNavigation(floatingRootContext, {
    listRef: store.itemDomElements,
    get activeIndex() {
      return store.activeIndex();
    },
    nested: parent.type !== undefined,
    onNavigate(nextActiveIndex) {
      store.setActiveIndex(nextActiveIndex);
    },
    openOnArrowKeyDown: parent.type !== 'context-menu',
  });

  const typeahead = useTypeahead(floatingRootContext, {
    listRef: store.itemLabels,
    elementsRef: store.itemDomElements,
    get activeIndex() {
      return store.activeIndex();
    },
    resetMs: TYPEAHEAD_RESET_MS,
    onMatch(index) {
      if (untrack(store.open) && index !== untrack(store.activeIndex)) {
        store.setActiveIndex(index);
      }
    },
    onTyping(nextTyping) {
      store.typingRef.current = nextTyping;
    },
  });

  const activeTriggerProps = mergeProps(
    typeahead.reference,
    listNavigation.trigger,
    dismiss.reference,
    interactionTypeProps,
    {
      'aria-haspopup': 'menu',
      get 'aria-expanded'() {
        return store.open() ? 'true' : 'false';
      },
    },
  );

  const inactiveTriggerProps = mergeProps(
    listNavigation.trigger,
    dismiss.trigger,
    interactionTypeProps,
    { 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );

  const popupProps = mergeProps(
    FOCUSABLE_POPUP_PROPS,
    typeahead.floating,
    listNavigation.floating,
    dismiss.floating,
  );

  const context: MenuRootContext = {
    store,
    parent,
    triggerProps: (active) => (active ? activeTriggerProps : inactiveTriggerProps),
    popupProps,
    itemProps: listNavigation.item,
  };

  return <MenuRootContext value={context}>{props.children}</MenuRootContext>;
}
