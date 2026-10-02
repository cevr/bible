// Upstream: packages/react/src/popover/store/PopoverStore.ts
//
// A popover's state: the popup's (open, mounted, active trigger, elements)
// plus how and why it last opened, whether it is modal, the ids of its title
// and description, what the active trigger says about hover opening, and
// whether a click right after a hover-open keeps it open (`stickIfOpen`).
// Its open-change pipeline is `setOpen`: `onOpenChange` (which may cancel),
// then the interactions hear of it, then the state changes.
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { FloatingTreeStore } from '../../floating-ui-solid/FloatingTree.tsx';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants.ts';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import {
  attachPreventUnmountOnClose,
  createPopupStore,
  type PopupStore,
} from '../../utils/popups/popupStore.ts';
import { Timeout } from '../../utils/timers.ts';
import type { InteractionType } from '../../utils/useOpenInteractionType.ts';

export type PopoverChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type PopoverChangeEventDetails = BaseUIChangeEventDetails<PopoverChangeEventReason> & {
  /** Keeps the popup mounted after closing until the `unmount` action is called. */
  preventUnmountOnClose: () => void;
};

export type PopoverInstantType = 'dismiss' | 'click' | 'focus' | undefined;

/** What the trigger that owns the open popover says about it. */
export interface PopoverTriggerData {
  readonly openOnHover: boolean;
  readonly closeDelay: number;
  readonly disabled: boolean;
}

export interface PopoverStoreOptions {
  openProp: () => boolean | undefined;
  defaultOpen: boolean;
  modal: () => boolean | 'trap-focus';
  openMethod: Accessor<InteractionType | null>;
  floatingId: string;
  nested: boolean;
  floatingTreeRoot: FloatingTreeStore;
  onOpenChange: () =>
    | ((open: boolean, eventDetails: PopoverChangeEventDetails) => void)
    | undefined;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface PopoverStore extends PopupStore {
  modal: Accessor<boolean | 'trap-focus'>;
  /** Whether the focus manager traps focus: modal, with a `Popover.Close` inside. */
  focusManagerModal: Accessor<boolean>;
  setFocusManagerModal: (value: boolean) => void;
  openMethod: Accessor<InteractionType | null>;
  openChangeReason: Accessor<PopoverChangeEventReason | null>;
  instantType: Accessor<PopoverInstantType>;
  /** Whether a click on the trigger keeps a hover-opened popover open. */
  stickIfOpen: Accessor<boolean>;
  titleElementId: Accessor<string | undefined>;
  setTitleElementId: (id: string | undefined) => void;
  descriptionElementId: Accessor<string | undefined>;
  setDescriptionElementId: (id: string | undefined) => void;
  /** The active trigger's data; set by that trigger while it owns the popup. */
  setTriggerData: (data: PopoverTriggerData | null) => void;
  openOnHover: Accessor<boolean>;
  closeDelay: Accessor<number>;
  disabled: Accessor<boolean>;
  readonly floatingTreeRoot: FloatingTreeStore;
  /** The patient-click timer, cleared when the popover closes. */
  readonly stickIfOpenTimeout: Timeout;
  /** Asks the popover to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, eventDetails: BaseUIChangeEventDetails) => void;
}

export function createPopoverStore(options: PopoverStoreOptions): PopoverStore {
  const owned = { ownedWrite: true } as const;
  const [openChangeReason, setOpenChangeReason] = createSignal<PopoverChangeEventReason | null>(
    null,
    owned,
  );
  const [instantType, setInstantType] = createSignal<PopoverInstantType>(undefined, owned);
  const [stickIfOpen, setStickIfOpen] = createSignal(true, owned);
  const [titleElementId, setTitleElementId] = createSignal<string | undefined>(undefined, owned);
  const [descriptionElementId, setDescriptionElementId] = createSignal<string | undefined>(
    undefined,
    owned,
  );
  const [focusManagerModal, setFocusManagerModal] = createSignal(false, owned);
  const [triggerData, setTriggerData] = createSignal<PopoverTriggerData | null>(null, owned);
  const stickIfOpenTimeout = new Timeout();

  const popup = createPopupStore({
    openProp: options.openProp,
    defaultOpen: options.defaultOpen,
    floatingId: options.floatingId,
    nested: options.nested,
    onOpenChange: (open, details) => setOpen(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
    onUnmount() {
      setStickIfOpen(true);
      setOpenChangeReason(null);
    },
  });

  function setOpen(nextOpen: boolean, eventDetails: BaseUIChangeEventDetails) {
    const reason = eventDetails.reason as PopoverChangeEventReason;
    const isHover = reason === REASONS.triggerHover;
    const isKeyboardClick =
      reason === REASONS.triggerPress &&
      (eventDetails.event as MouseEvent | undefined)?.detail === 0;
    const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);

    const details = eventDetails as PopoverChangeEventDetails;
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(details);

    // A close button closes from the trigger that opened the popup.
    if (!nextOpen && reason === REASONS.closePress && eventDetails.trigger == null) {
      const activeTriggerId = untrack(popup.activeTriggerId);
      if (activeTriggerId != null) {
        eventDetails.trigger =
          popup.triggerElements.getById(activeTriggerId) ??
          untrack(popup.activeTriggerElement) ??
          undefined;
      }
    }

    untrack(options.onOpenChange)?.(nextOpen, details);
    if (eventDetails.isCanceled) {
      return;
    }
    popup.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

    if (isHover) {
      // A click within the patient-click threshold of a hover-open keeps the popup open.
      setStickIfOpen(true);
      stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => setStickIfOpen(false));
    }

    setOpenChangeReason(reason);
    popup.applyOpenState(nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());

    let nextInstantType: PopoverInstantType;
    if (isKeyboardClick) {
      nextInstantType = 'click';
    } else if (isDismissClose) {
      nextInstantType = 'dismiss';
    } else if (reason === REASONS.focusOut) {
      nextInstantType = 'focus';
    }
    setInstantType(nextInstantType);
  }

  return {
    ...popup,
    modal: options.modal,
    focusManagerModal,
    setFocusManagerModal: (value) => setFocusManagerModal(value),
    openMethod: options.openMethod,
    openChangeReason,
    instantType,
    stickIfOpen,
    titleElementId,
    setTitleElementId: (id) => setTitleElementId(id),
    descriptionElementId,
    setDescriptionElementId: (id) => setDescriptionElementId(id),
    setTriggerData: (data) => setTriggerData(() => data),
    openOnHover: () => triggerData()?.openOnHover ?? false,
    closeDelay: () => triggerData()?.closeDelay ?? 0,
    disabled: () => triggerData()?.disabled ?? false,
    floatingTreeRoot: options.floatingTreeRoot,
    setOpen: (open, details) => popup.floatingRootContext.setOpen(open, details),
    stickIfOpenTimeout,
  };
}
