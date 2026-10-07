// Upstream: packages/react/src/menu/store/MenuStore.ts
//
// A menu's state: the popup's (open, mounted, active trigger, elements) plus
// the highlighted item and how the menu opened. A context menu
// shares its root id and mouse-up gesture flag with the context menu around it.
import { type Accessor, createSignal } from 'solid-js';

import type { ContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';
import { createPopupStore, type PopupStore } from '../../utils/popups/popupStore.ts';
import type { InteractionType } from '../../utils/useOpenInteractionType.ts';

export type MenuParent =
  | { type: 'context-menu'; context: ContextMenuRootContext }
  | { type: undefined };

export type MenuChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.focusOut
  | typeof REASONS.listNavigation
  | typeof REASONS.escapeKey
  | typeof REASONS.itemPress
  | typeof REASONS.cancelOpen
  | typeof REASONS.none;

export type MenuChangeEventDetails = BaseUIChangeEventDetails<MenuChangeEventReason>;

export type MenuInstantType = 'dismiss' | 'click' | undefined;

export interface MenuStoreOptions {
  parent: MenuParent;
  openMethod: Accessor<InteractionType | null>;
  floatingId: string;
  rootId: string;
  onOpenChange: (open: boolean, details: BaseUIChangeEventDetails) => void;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface MenuStore extends PopupStore {
  readonly parent: MenuParent;
  openMethod: Accessor<InteractionType | null>;
  /** The id the menu's popup carries as `data-rootownerid`. */
  rootId: Accessor<string>;
  /** The highlighted item's index (`null` for none). */
  activeIndex: Accessor<number | null>;
  setActiveIndex: (index: number | null) => void;
  isActive: (index: number) => boolean;
  instantType: Accessor<MenuInstantType>;
  lastOpenChangeReason: Accessor<MenuChangeEventReason | null>;
  /** Asks the menu to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, details: BaseUIChangeEventDetails) => void;
  /** Applies an accepted open change with the menu's own state. */
  applyMenuOpenState: (
    open: boolean,
    details: BaseUIChangeEventDetails,
    menuState: { reason: MenuChangeEventReason; instantType: MenuInstantType },
  ) => void;
  readonly itemDomElements: { current: Array<HTMLElement | null> };
  readonly itemLabels: { current: Array<string | null> };
  readonly typingRef: { current: boolean };
  /** Whether a mouseup on an item activates it (a press on the trigger dragged onto it). */
  allowMouseUpTriggerRef: { current: boolean };
}

export function createMenuStore(options: MenuStoreOptions): MenuStore {
  const popup = createPopupStore({
    floatingId: options.floatingId,
    onOpenChange: (open, details) => options.onOpenChange(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  const owned = { ownedWrite: true } as const;
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null, owned);
  const [instantType, setInstantType] = createSignal<MenuInstantType>(undefined, owned);
  const [lastOpenChangeReason, setLastOpenChangeReason] =
    createSignal<MenuChangeEventReason | null>(null, owned);

  const parent = options.parent;
  const contextMenu = parent.type === 'context-menu' ? parent.context : undefined;

  const store: MenuStore = {
    ...popup,
    parent,
    openMethod: options.openMethod,
    rootId: () => contextMenu?.rootId ?? options.rootId,
    activeIndex,
    setActiveIndex: (index) => setActiveIndex(index),
    isActive: (index) => activeIndex() === index,
    instantType,
    lastOpenChangeReason,
    setOpen: (open, details) => popup.floatingRootContext.setOpen(open, details),
    applyMenuOpenState(open, details, menuState) {
      setLastOpenChangeReason(menuState.reason);
      setInstantType(menuState.instantType);
      popup.applyOpenState(open, details.trigger);
    },
    itemDomElements: { current: [] },
    itemLabels: { current: [] },
    typingRef: { current: false },
    allowMouseUpTriggerRef: contextMenu?.allowMouseUpTriggerRef ?? { current: false },
  };
  return store;
}
