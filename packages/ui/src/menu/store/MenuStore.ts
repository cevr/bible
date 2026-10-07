// Upstream: packages/react/src/menu/store/MenuStore.ts
//
// A menu's state: the popup's (open, mounted, active trigger, elements) plus
// the highlighted item and how the menu opened. A context menu
// shares its root id and mouse-up gesture flag with the context menu around it.
import { type Accessor, createSignal, untrack } from 'solid-js';

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

export type MenuHighlightEventReason =
  | typeof REASONS.keyboard
  | typeof REASONS.pointer
  | typeof REASONS.none;

export type MenuInstantType = 'dismiss' | 'click' | undefined;

export interface MenuStoreOptions {
  parent: MenuParent;
  openProp: () => boolean | undefined;
  disabled: () => boolean;
  modal: () => boolean | undefined;
  openMethod: Accessor<InteractionType | null>;
  floatingId: string;
  rootId: string;
  onOpenChange: (open: boolean, details: BaseUIChangeEventDetails) => void;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface MenuStore extends PopupStore {
  readonly parent: MenuParent;
  disabled: Accessor<boolean>;
  /** Whether the open menu is modal. */
  modal: Accessor<boolean>;
  openMethod: Accessor<InteractionType | null>;
  /** The id the menu's popup carries as `data-rootownerid`. */
  rootId: Accessor<string>;
  activeIndex: Accessor<number | null>;
  /** Moves the highlight; the reason reaches `onItemHighlighted`. */
  setActiveIndex: (index: number | null, reason: MenuHighlightEventReason, event?: Event) => void;
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
  /** Why the next highlight change happens, reported once it lands. */
  highlightReason: MenuHighlightEventReason;
  highlightEvent: Event | undefined;
  /** The item last reported as highlighted. */
  reportedItem: HTMLElement | undefined;
}

export function createMenuStore(options: MenuStoreOptions): MenuStore {
  const popup = createPopupStore({
    openProp: options.openProp,
    floatingId: options.floatingId,
    onOpenChange: (open, details) => options.onOpenChange(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  const owned = { ownedWrite: true } as const;
  const [activeIndex, setActiveIndexSignal] = createSignal<number | null>(null, owned);
  const [instantType, setInstantType] = createSignal<MenuInstantType>(undefined, owned);
  const [lastOpenChangeReason, setLastOpenChangeReason] =
    createSignal<MenuChangeEventReason | null>(null, owned);

  const parent = options.parent;
  const contextMenu = parent.type === 'context-menu' ? parent.context : undefined;

  const store: MenuStore = {
    ...popup,
    parent,
    disabled: options.disabled,
    modal: () => options.modal() ?? true,
    openMethod: options.openMethod,
    rootId: () => contextMenu?.rootId ?? options.rootId,
    activeIndex,
    setActiveIndex(index, reason, event) {
      // Only a change is tagged; a write back to the reported item reports `none`.
      if (untrack(activeIndex) !== index) {
        const item = index === null ? undefined : store.itemDomElements.current[index];
        const isWriteBack = item === store.reportedItem;
        store.highlightReason = isWriteBack ? 'none' : reason;
        store.highlightEvent = isWriteBack ? undefined : event;
      }
      setActiveIndexSignal(index);
    },
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
    highlightReason: 'none',
    highlightEvent: undefined,
    reportedItem: undefined,
  };
  return store;
}
