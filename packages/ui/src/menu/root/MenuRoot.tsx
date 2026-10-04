// Upstream: packages/react/src/menu/root/MenuRoot.tsx
//
// Groups a menu's parts and owns its state. Opening and closing go through
// one pipeline: `onOpenChange` (which may cancel), then the interactions
// hear of it, then the menu records why it changed, whether the keyboard
// opened it (so focus lands on an item) and whether its transition is
// skipped. The root wires the interactions the parts share: Escape and
// outside presses, arrow-key navigation, typeahead, and how it was opened.
//
// A top-level menu or a context menu starts a tree of nested menus; a
// submenu (`Menu.SubmenuRoot`) joins its parent's.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, onCleanup, untrack } from 'solid-js';

import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import { useDirectionAccessor } from '../../direction-provider/DirectionContext.ts';
import {
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
} from '../../floating-ui-solid/FloatingTree.tsx';
import { useDismiss } from '../../floating-ui-solid/hooks/useDismiss.ts';
import {
  type HighlightItemTarget,
  useListNavigation,
} from '../../floating-ui-solid/hooks/useListNavigation.ts';
import { useTypeahead } from '../../floating-ui-solid/hooks/useTypeahead.ts';
import { TYPEAHEAD_RESET_MS } from '../../internals/constants.ts';
import {
  type BaseUIChangeEventDetails,
  type BaseUIGenericEventDetails,
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { Orientation } from '../../internals/types.ts';
import { mergeProps } from '../../merge-props/mergeProps.ts';
import {
  attachPreventUnmountOnClose,
  FOCUSABLE_POPUP_PROPS,
} from '../../utils/popups/popupStore.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useOpenInteractionType } from '../../utils/useOpenInteractionType.ts';
import {
  createMenuStore,
  type MenuChangeEventDetails,
  type MenuChangeEventReason,
  type MenuHighlightEventReason,
  type MenuInstantType,
  type MenuParent,
  menuTreeFor,
} from '../store/MenuStore.ts';
import { isKeyboardClick, isKeyboardOpen } from '../utils/isKeyboardOpen.ts';
import { MenuRootContext, useMenuRootContextOptional } from './MenuRootContext.ts';

export type { MenuChangeEventDetails, MenuChangeEventReason, MenuHighlightEventReason };

export type MenuHighlightEventDetails = BaseUIGenericEventDetails<
  MenuHighlightEventReason,
  { label: string | undefined }
>;

export interface MenuRootActions {
  /** Ends a close kept mounted by `preventUnmountOnClose()`. */
  unmount: () => void;
  close: () => void;
  /** Moves or clears the highlight while the menu is open. */
  highlightItem: (target: HighlightItemTarget) => void;
}

export interface MenuRootProps {
  /** @default false */
  defaultOpen?: boolean | undefined;
  /** @default true */
  loopFocus?: boolean | undefined;
  /** Whether the pointer highlights items. @default true */
  highlightItemOnHover?: boolean | undefined;
  /**
   * Whether the open menu is modal: page scroll locked and outside pointer
   * interaction blocked. Nested menus ignore it; hover-opened menus never are.
   * @default true
   */
  modal?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: MenuChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  onItemHighlighted?:
    | ((item: HTMLElement | undefined, eventDetails: MenuHighlightEventDetails) => void)
    | undefined;
  open?: boolean | undefined;
  /** @default 'vertical' */
  orientation?: Orientation | undefined;
  /** @default false */
  disabled?: boolean | undefined;
  /** In a submenu, whether Escape closes the whole menu. @default false */
  closeParentOnEsc?: boolean | undefined;
  /** Receives the imperative actions. */
  actionsRef?: { current: MenuRootActions | null } | undefined;
  children?: JSX.Element;
}

interface MenuRootInternalProps extends MenuRootProps {
  /** Marks this root as a submenu of the enclosing menu. */
  isSubmenu?: boolean | undefined;
}

function getHighlightReason(event: Event | undefined): MenuHighlightEventReason {
  if (event == null) {
    return REASONS.none;
  }
  if (event.type.startsWith('key')) {
    return REASONS.keyboard;
  }
  if (event.type.startsWith('mouse') || event.type.startsWith('pointer')) {
    return REASONS.pointer;
  }
  return REASONS.none;
}

export function MenuRootInternal(props: MenuRootInternalProps): JSX.Element {
  const contextMenuContext = useContextMenuRootContext();
  const parentRootContext = useMenuRootContextOptional();
  const enclosingStore = parentRootContext?.store;

  let parent: MenuParent = { type: undefined };
  if (props.isSubmenu && enclosingStore) {
    parent = { type: 'menu', store: enclosingStore };
  } else if (contextMenuContext && !enclosingStore) {
    parent = { type: 'context-menu', context: contextMenuContext };
  }

  const rootId = createUniqueId();
  const floatingId = createUniqueId();
  const floatingTreeRoot = menuTreeFor(parent);
  const floatingParentNodeId = useFloatingParentNodeId();
  const floatingNodeId = useFloatingNodeId(floatingTreeRoot);
  const nested = floatingParentNodeId != null;

  const parentStore = parent.type === 'menu' ? parent.store : undefined;
  // A submenu open from the start animates in only when its parent is animating in too.
  const animateInitialOpen = untrack(
    () =>
      (props.open ?? props.defaultOpen ?? false) && parentStore?.transitionStatus() === 'starting',
  );
  const seededInstantType: MenuInstantType = animateInitialOpen
    ? untrack(() => parentStore?.instantType())
    : undefined;

  let openRead = () => false;
  const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(() =>
    openRead(),
  );

  const store = createMenuStore({
    parent,
    openProp: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen ?? false),
    disabled: () => props.disabled ?? false,
    modal: () => (parent.type === undefined ? props.modal : undefined),
    highlightItemOnHover: () => props.highlightItemOnHover ?? true,
    openMethod,
    floatingId,
    rootId,
    floatingTreeRoot,
    floatingNodeId,
    floatingParentNodeId,
    animateInitialOpen,
    initialInstantType: seededInstantType,
    onOpenChange: setOpen,
    onOpenChangeComplete: () => props.onOpenChangeComplete,
  });
  openRead = store.open;

  const floatingRootContext = store.floatingRootContext;

  // An inherited instant type is for the first reveal only.
  if (seededInstantType !== undefined) {
    createEffect(
      () => [store.open(), store.transitionStatus()] as const,
      ([isOpen, status]) => {
        if ((!isOpen || status === undefined) && untrack(store.instantType) === seededInstantType) {
          store.setInstantType(undefined);
        }
      },
    );
  }

  let openEvent: Event | null = null;
  let allowOutsidePressDismissal = parent.type !== 'context-menu';
  const allowOutsidePressDismissalTimeout = useTimeout();
  let allowTouchToClose = true;
  const allowTouchToCloseTimeout = useTimeout();

  createEffect(store.open, (isOpen) => {
    if (!isOpen) {
      openEvent = null;
      if (!untrack(store.hoverEnabled)) {
        store.setHoverEnabled(true);
      }
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
    // Relayed tree events and stale hover timers can ask a closed menu to close.
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
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(details);
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
    if (
      !nextOpen &&
      reason !== REASONS.itemPress &&
      nativeEvent?.type === 'click' &&
      (nativeEvent as PointerEvent).pointerType === 'touch' &&
      !allowTouchToClose
    ) {
      return;
    }
    // Some touch browsers fire focus before the click; the click must not close what focus opened.
    if (nextOpen && reason === REASONS.triggerFocus) {
      allowTouchToClose = false;
      allowTouchToCloseTimeout.start(300, () => {
        allowTouchToClose = true;
      });
    } else {
      allowTouchToClose = true;
      allowTouchToCloseTimeout.clear();
    }

    const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);
    openEvent = nativeEvent;

    let instantType: MenuInstantType;
    if (isKeyboardClick(reason, nativeEvent)) {
      instantType = 'click';
    } else if (isDismissClose) {
      instantType = 'dismiss';
    }

    store.applyMenuOpenState(nextOpen, eventDetails, shouldPreventUnmountOnClose(), {
      reason,
      keyboardOpen: nextOpen && isKeyboardOpen(reason, nativeEvent),
      instantType,
    });
  }

  if (parent.type === 'context-menu') {
    const ctx = parent.context;
    ctx.actionsRef.current = { setOpen };
    createEffect(store.positionerElement, (element) => {
      ctx.positionerRef.current = element;
    });
  }

  const enabled = () => !store.disabled();

  const dismiss = useDismiss(floatingRootContext, {
    get enabled() {
      return enabled();
    },
    get bubbles() {
      return { escapeKey: (props.closeParentOnEsc ?? false) && parent.type === 'menu' };
    },
    outsidePress() {
      if (parent.type !== 'context-menu' || openEvent?.type === 'contextmenu') {
        return true;
      }
      return allowOutsidePressDismissal;
    },
    // Always the menu tree, top level included: a press inside a submenu reaches this
    // menu only through the tree (React found it by bubbling through its portals).
    externalTree: floatingTreeRoot,
  });

  const direction = useDirectionAccessor();
  const loopFocus = () => props.loopFocus ?? true;
  const orientation = () => props.orientation ?? 'vertical';

  const listNavigation = useListNavigation(floatingRootContext, {
    get enabled() {
      return enabled();
    },
    listRef: store.itemDomElements,
    get activeIndex() {
      return store.activeIndex();
    },
    nested: parent.type !== undefined,
    get loopFocus() {
      return loopFocus();
    },
    get orientation() {
      return orientation();
    },
    get triggerOrientation() {
      return orientation();
    },
    get rtl() {
      return direction() === 'rtl';
    },
    disabledIndices: [],
    onNavigate(nextActiveIndex, event, source) {
      store.setActiveIndex(
        nextActiveIndex,
        source === 'imperative' ? REASONS.imperativeAction : getHighlightReason(event),
        event,
      );
    },
    openOnArrowKeyDown: parent.type !== 'context-menu',
    externalTree: nested ? floatingTreeRoot : undefined,
    get focusItemOnHover() {
      return store.highlightItemOnHover();
    },
    resetOnPointerLeave: true,
  });

  if (props.actionsRef) {
    props.actionsRef.current = {
      unmount: store.forceUnmount,
      close: () => store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction)),
      highlightItem: listNavigation.highlightItem,
    };
  }

  const typeahead = useTypeahead(floatingRootContext, {
    get enabled() {
      return enabled();
    },
    listRef: store.itemLabels,
    elementsRef: store.itemDomElements,
    get activeIndex() {
      return store.activeIndex();
    },
    resetMs: TYPEAHEAD_RESET_MS,
    onMatch(index, event) {
      if (untrack(store.open) && index !== untrack(store.activeIndex)) {
        store.setActiveIndex(index, REASONS.keyboard, event);
      }
    },
    onTyping(nextTyping) {
      store.typingRef.current = nextTyping;
    },
  });

  // Reports the highlighted item when `activeIndex` lands, and again once the item registry
  // settles, since an index can come to name another element.
  let lastHighlightIndex = -1;
  const syncHighlightedItem = () => {
    const index = untrack(store.activeIndex);
    const item = index === null ? undefined : (store.itemDomElements.current[index] ?? undefined);
    // An item removed this tick stays registered until the list flushes, which calls back here.
    if (item?.isConnected === false) {
      return;
    }
    const itemIndex = item === undefined || index === null ? -1 : index;
    if (lastHighlightIndex === itemIndex && store.reportedItem === item) {
      return;
    }
    lastHighlightIndex = itemIndex;
    store.reportedItem = item;
    const { highlightReason, highlightEvent } = store;
    store.highlightReason = REASONS.none;
    store.highlightEvent = undefined;
    const onItemHighlighted = untrack(() => props.onItemHighlighted);
    if (!onItemHighlighted) {
      return;
    }
    onItemHighlighted(
      item,
      createGenericEventDetails(highlightReason, highlightEvent, {
        label: item === undefined ? undefined : (store.itemLabels.current[itemIndex] ?? undefined),
      }),
    );
  };
  createEffect(store.activeIndex, () => syncHighlightedItem());

  const activeTriggerProps = mergeProps(
    typeahead.reference,
    listNavigation.reference,
    dismiss.reference ?? {},
    {
      onMouseMove() {
        store.setAllowMouseEnter(true);
      },
    },
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
    dismiss.trigger ?? {},
    interactionTypeProps,
    { 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );

  const popupProps = mergeProps(
    FOCUSABLE_POPUP_PROPS,
    {
      onMouseMove() {
        store.setAllowMouseEnter(true);
        if (parent.type === 'menu') {
          store.setHoverEnabled(false);
        }
      },
      onClick() {
        if (untrack(store.hoverEnabled)) {
          store.setHoverEnabled(false);
        }
      },
    },
    typeahead.floating,
    listNavigation.floating,
    dismiss.floating ?? {},
  );

  const context: MenuRootContext = {
    store,
    parent,
    orientation,
    triggerProps: (active) => (active ? activeTriggerProps : inactiveTriggerProps),
    popupProps,
    itemProps: listNavigation.item,
    parentItemProps: parentRootContext?.itemProps ?? {},
    syncHighlightedItem,
  };

  onCleanup(() => {
    if (props.actionsRef) {
      props.actionsRef.current = null;
    }
  });

  const content = () => <MenuRootContext value={context}>{props.children}</MenuRootContext>;

  if (parent.type === undefined || parent.type === 'context-menu') {
    return <FloatingTree externalTree={floatingTreeRoot}>{content()}</FloatingTree>;
  }
  return content();
}

/**
 * Groups all parts of the menu.
 * Doesn't render its own HTML element.
 */
export function MenuRoot(props: MenuRootProps): JSX.Element {
  return <MenuRootInternal {...props} />;
}
