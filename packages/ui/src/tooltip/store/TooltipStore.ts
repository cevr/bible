// Upstream: packages/react/src/tooltip/store/TooltipStore.ts,
// packages/react/src/utils/popups/popupStoreUtils.ts (applyPopupOpenChange)
//
// A tooltip's state: the popup's (open, mounted, active trigger, elements)
// plus why it last opened or closed, whether it is disabled, whether a press
// on its trigger closes it, how long a hover-out waits before it closes,
// and why transitions are skipped (`instantType`). Its open-change pipeline
// is `setOpen`: `onOpenChange` (which may cancel), then the interactions
// hear of it, then the state changes. A disabled tooltip never shows as open.
import { type Accessor, createSignal, untrack } from 'solid-js';

import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import {
  attachPreventUnmountOnClose,
  createPopupStore,
  type PopupStore,
} from '../../utils/popups/popupStore.ts';

export type TooltipChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.disabled
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type TooltipChangeEventDetails = BaseUIChangeEventDetails<TooltipChangeEventReason> & {
  /** Keeps the popup mounted after closing until the `unmount` action is called. */
  preventUnmountOnClose: () => void;
};

/** Why transitions are skipped: a hand-over within a delay group, a dismissal, or a focus open. */
export type TooltipInstantType = 'delay' | 'dismiss' | 'focus' | undefined;

/** What the trigger that owns the open tooltip says about it. */
export interface TooltipTriggerData {
  readonly closeDelay: number;
}

export interface TooltipStoreOptions {
  openProp: () => boolean | undefined;
  defaultOpen: boolean;
  floatingId: string;
  disabled: Accessor<boolean>;
  disableHoverablePopup: Accessor<boolean>;
  onOpenChange: () =>
    | ((open: boolean, eventDetails: TooltipChangeEventDetails) => void)
    | undefined;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface TooltipStore extends PopupStore {
  /** Whether the tooltip is open in its own state, before `disabled` hides it. */
  rawOpen: Accessor<boolean>;
  disabled: Accessor<boolean>;
  disableHoverablePopup: Accessor<boolean>;
  lastOpenChangeReason: Accessor<TooltipChangeEventReason | null>;
  instantType: Accessor<TooltipInstantType>;
  /** Whether the open tooltip's delay group is handing over from one tooltip to the next. */
  setIsInstantPhase: (value: boolean) => void;
  closeOnClick: Accessor<boolean>;
  setCloseOnClick: (value: boolean) => void;
  closeDelay: Accessor<number>;
  /** The active trigger's data; set by that trigger while it owns the popup. */
  setTriggerData: (data: TooltipTriggerData | null) => void;
  /** Asks the tooltip to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, eventDetails: BaseUIChangeEventDetails) => void;
  /** Clears a pending hover open without reporting an open-state change. */
  cancelPendingOpen: (event: Event) => void;
}

export function createTooltipStore(options: TooltipStoreOptions): TooltipStore {
  const owned = { ownedWrite: true } as const;
  const [lastOpenChangeReason, setLastOpenChangeReason] =
    createSignal<TooltipChangeEventReason | null>(null, owned);
  const [ownInstantType, setOwnInstantType] = createSignal<TooltipInstantType>(undefined, owned);
  const [isInstantPhase, setIsInstantPhase] = createSignal(false, owned);
  const [closeOnClick, setCloseOnClick] = createSignal(true, owned);
  const [triggerData, setTriggerData] = createSignal<TooltipTriggerData | null>(null, owned);

  const popup = createPopupStore({
    // A disabled tooltip is closed whatever its owner says.
    openProp: () => (options.disabled() ? false : options.openProp()),
    defaultOpen: options.defaultOpen,
    floatingId: options.floatingId,
    nested: false,
    onOpenChange: (open, details) => setOpen(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  // The open state without `disabled`: the popup store's `open` is already gated.
  const [rawOpen, setRawOpen] = createSignal(options.defaultOpen, owned);
  const rawOpenRead = () => options.openProp() ?? rawOpen();

  function setOpen(nextOpen: boolean, eventDetails: BaseUIChangeEventDetails) {
    const reason = eventDetails.reason as TooltipChangeEventReason;
    const isHover = reason === REASONS.triggerHover;
    const isFocusOpen = nextOpen && reason === REASONS.triggerFocus;
    const isDismissClose =
      !nextOpen && (reason === REASONS.triggerPress || reason === REASONS.escapeKey);

    const details = eventDetails as TooltipChangeEventDetails;
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(details);

    untrack(options.onOpenChange)?.(nextOpen, details);
    if (eventDetails.isCanceled) {
      return;
    }
    popup.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

    setLastOpenChangeReason(reason);
    setRawOpen(nextOpen);
    popup.applyOpenState(nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());

    if (isFocusOpen) {
      setOwnInstantType('focus');
    } else if (isDismissClose) {
      setOwnInstantType('dismiss');
    } else if (isHover) {
      setOwnInstantType(undefined);
    }
  }

  // Transitions are skipped while a delay group hands over from one tooltip
  // to the next: the opening one during the instant phase, and the one it
  // closes (reason `none`) on its way out. Otherwise the own reason applies.
  const instantType = (): TooltipInstantType => {
    const status = popup.transitionStatus();
    if (
      (status === 'ending' && lastOpenChangeReason() === REASONS.none) ||
      (status !== 'ending' && isInstantPhase())
    ) {
      return 'delay';
    }
    return ownInstantType();
  };

  return {
    ...popup,
    rawOpen: rawOpenRead,
    disabled: options.disabled,
    disableHoverablePopup: options.disableHoverablePopup,
    lastOpenChangeReason,
    instantType,
    setIsInstantPhase: (value) => setIsInstantPhase(value),
    closeOnClick,
    setCloseOnClick: (value) => setCloseOnClick(value),
    closeDelay: () => triggerData()?.closeDelay ?? 0,
    setTriggerData: (data) => setTriggerData(() => data),
    setOpen: (open, details) => popup.floatingRootContext.setOpen(open, details),
    cancelPendingOpen(event) {
      popup.floatingRootContext.dispatchOpenChange(
        false,
        createChangeEventDetails(REASONS.triggerPress, event),
      );
    },
  };
}
