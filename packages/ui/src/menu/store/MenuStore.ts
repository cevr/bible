// Upstream: packages/react/src/menu/store/MenuStore.ts
//
// A menu's state: the popup's (open, mounted, active trigger, elements) plus
// the highlighted item, how the menu opened, and its tree. A context menu
// shares its root id and mouse-up gesture flag with the context menu around it.
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { ContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext.ts';
import type { FloatingTreeStore } from '../../floating-ui-solid/FloatingTreeStore.ts';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';
import { createPopupStore, type PopupStore } from '../../utils/popups/popupStore.ts';
import type { InteractionType } from '../../utils/useOpenInteractionType.ts';

export type MenuParent =
  | { type: 'context-menu'; context: ContextMenuRootContext }
  | { type: undefined };

export type MenuChangeEventReason =
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.focusOut
  | typeof REASONS.listNavigation
  | typeof REASONS.escapeKey
  | typeof REASONS.itemPress
  | typeof REASONS.closePress
  | typeof REASONS.cancelOpen
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type MenuChangeEventDetails = BaseUIChangeEventDetails<MenuChangeEventReason> & {
  /** Keeps the popup mounted after closing until the `unmount` action is called. */
  preventUnmountOnClose: () => void;
};

export type MenuHighlightEventReason =
  | typeof REASONS.keyboard
  | typeof REASONS.pointer
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type MenuInstantType = 'dismiss' | 'click' | undefined;

export interface MenuStoreOptions {
  parent: MenuParent;
  openProp: () => boolean | undefined;
  defaultOpen: boolean;
  disabled: () => boolean;
  modal: () => boolean | undefined;
  highlightItemOnHover: () => boolean;
  openMethod: Accessor<InteractionType | null>;
  floatingId: string;
  rootId: string;
  floatingTreeRoot: FloatingTreeStore;
  floatingNodeId: string;
  floatingParentNodeId: string | null;
  onOpenChange: (open: boolean, details: BaseUIChangeEventDetails) => void;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface MenuStore extends PopupStore {
  readonly parent: MenuParent;
  disabled: Accessor<boolean>;
  /** Whether the open menu is modal. */
  modal: Accessor<boolean>;
  openMethod: Accessor<InteractionType | null>;
  keyboardOpen: Accessor<boolean>;
  highlightItemOnHover: Accessor<boolean>;
  /** The id the menu's popup carries as `data-rootownerid`. */
  rootId: Accessor<string>;
  activeIndex: Accessor<number | null>;
  /** Moves the highlight; the reason reaches `onItemHighlighted`. */
  setActiveIndex: (index: number | null, reason: MenuHighlightEventReason, event?: Event) => void;
  isActive: (index: number) => boolean;
  instantType: Accessor<MenuInstantType>;
  lastOpenChangeReason: Accessor<MenuChangeEventReason | null>;
  readonly floatingTreeRoot: FloatingTreeStore;
  readonly floatingNodeId: string;
  readonly floatingParentNodeId: string | null;
  /** Asks the menu to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, details: BaseUIChangeEventDetails) => void;
  /** Applies an accepted open change with the menu's own state. */
  applyMenuOpenState: (
    open: boolean,
    details: BaseUIChangeEventDetails,
    preventUnmount: boolean,
    menuState: {
      reason: MenuChangeEventReason;
      keyboardOpen: boolean;
      instantType: MenuInstantType;
    },
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
    defaultOpen: options.defaultOpen,
    floatingId: options.floatingId,
    nested: options.floatingParentNodeId != null,
    onOpenChange: (open, details) => options.onOpenChange(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  const owned = { ownedWrite: true } as const;
  const [keyboardOpen, setKeyboardOpen] = createSignal(false, owned);
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
    keyboardOpen,
    highlightItemOnHover: options.highlightItemOnHover,
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
    floatingTreeRoot: options.floatingTreeRoot,
    floatingNodeId: options.floatingNodeId,
    floatingParentNodeId: options.floatingParentNodeId,
    setOpen: (open, details) => popup.floatingRootContext.setOpen(open, details),
    applyMenuOpenState(open, details, preventUnmount, menuState) {
      setLastOpenChangeReason(menuState.reason);
      setKeyboardOpen(menuState.keyboardOpen);
      setInstantType(menuState.instantType);
      popup.applyOpenState(open, details.trigger, preventUnmount);
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
