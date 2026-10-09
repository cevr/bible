// Upstream: packages/react/src/utils/popups/store.ts,
// packages/react/src/utils/popups/popupStoreUtils.ts,
// packages/react/src/utils/popups/useTriggerFocusGuards.ts
//
// The state every popup (menu, dialog) keeps: whether it is open
// (a dialog owner's `open` prop wins over its own), whether it is still mounted
// for an exit transition, which trigger opened it, its popup and positioner
// elements, and the floating root context its interactions read. A part
// family builds its own store over this one and runs its own open-change
// pipeline, ending in `applyOpenState`.
//
// Upstream's stores are external stores React subscribes to; here each field
// is a signal and the selectors are plain functions over them.
import { type Accessor, createSignal, flush, untrack } from 'solid-js';

import {
  createFloatingRootContext,
  type FloatingRootContext,
  type ReferenceType,
} from '../../floating-ui-solid/FloatingRootContext.ts';
import { FOCUSABLE_ATTRIBUTE } from '../../floating-ui-solid/utils/element.ts';
import { getTabbableNearElement, isOutsideEvent } from '../../floating-ui-solid/utils/tabbable.ts';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { createUnmountAfterClose, type TransitionStatus } from '../../internals/transitions.ts';

/** The props that make a popup element the focus manager's target. */
export const FOCUSABLE_POPUP_PROPS = {
  tabindex: -1,
  [FOCUSABLE_ATTRIBUTE]: '',
};

type Ref<T> = { current: T };

interface PopupStoreOptions {
  /** The owner's `open` prop (a dialog's); none, or `undefined`, leaves the popup in charge. */
  openProp?: (() => boolean | undefined) | undefined;
  /** The popup's id when its element sets none. */
  floatingId: string;
  /** Whether Floating UI positions the popup element itself rather than the positioner. */
  popupIsFloatingElement?: boolean | undefined;
  /** The family's open-change pipeline, which the interactions call. */
  onOpenChange: (open: boolean, details: BaseUIChangeEventDetails) => void;
  onOpenChangeComplete?: (() => ((open: boolean) => void) | undefined) | undefined;
}

export interface PopupStore {
  open: Accessor<boolean>;
  mounted: Accessor<boolean>;
  transitionStatus: Accessor<TransitionStatus>;
  /** The trigger that opened the popup, while it is mounted. */
  activeTriggerElement: Accessor<Element | null>;
  popupElement: Accessor<HTMLElement | null>;
  setPopupElement: (element: HTMLElement | null) => void;
  positionerElement: Accessor<HTMLElement | null>;
  setPositionerElement: (element: HTMLElement | null) => void;
  floatingRootContext: FloatingRootContext;
  floatingId: string;
  /** The popup's rendered id (its element's, else `floatingId`). */
  popupId: () => string | undefined;
  /** Applies an accepted open change; `trigger` becomes the active trigger. */
  applyOpenState: (open: boolean, trigger: Element | undefined) => void;
  readonly onOpenChangeComplete: (open: boolean) => void;
  readonly triggerFocusTargetRef: Ref<HTMLElement | null>;
  readonly beforeTriggerFocusGuardRef: Ref<HTMLElement | null>;
  readonly beforeContentFocusGuardRef: Ref<HTMLElement | null>;
}

export function createPopupStore(options: PopupStoreOptions): PopupStore {
  const [ownOpen, setOwnOpen] = createSignal(false, { ownedWrite: true });
  const open = () => options.openProp?.() ?? ownOpen();
  const [activeTrigger, setActiveTrigger] = createSignal<Element | null>(null, {
    ownedWrite: true,
  });
  const [popupElement, setPopupElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const [positionerElement, setPositionerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const onOpenChangeComplete = (isOpen: boolean) => {
    untrack(() => options.onOpenChangeComplete?.())?.(isOpen);
  };

  const status = createUnmountAfterClose({
    open,
    element: popupElement,
    onUnmount() {
      setActiveTrigger(null);
      onOpenChangeComplete(false);
    },
  });

  const activeTriggerElement = () => (status.mounted() ? activeTrigger() : null);

  const floatingRootContext = createFloatingRootContext({
    open,
    referenceElement: activeTriggerElement as Accessor<ReferenceType | null>,
    floatingElement: options.popupIsFloatingElement ? popupElement : positionerElement,
    onOpenChange: (next, details) => options.onOpenChange(next, details),
  });

  const popupId = () => popupElement()?.id || options.floatingId || undefined;

  return {
    open,
    mounted: status.mounted,
    transitionStatus: status.transitionStatus,
    activeTriggerElement,
    popupElement,
    setPopupElement: (element) => setPopupElement(() => element),
    positionerElement,
    setPositionerElement: (element) => setPositionerElement(() => element),
    floatingRootContext,
    floatingId: options.floatingId,
    popupId,
    applyOpenState(nextOpen, trigger) {
      // A close without a trigger keeps the old one, so focus returns to it and exits animate from it.
      if (trigger || nextOpen) {
        setActiveTrigger(() => trigger ?? null);
      }
      setOwnOpen(nextOpen);
    },
    onOpenChangeComplete,
    triggerFocusTargetRef: { current: null },
    beforeTriggerFocusGuardRef: { current: null },
    beforeContentFocusGuardRef: { current: null },
  };
}

/**
 * The handlers of the invisible guards around an open popup's trigger: Tab
 * onto one closes the popup and moves on to the next (or previous) tabbable
 * element in the page, past the portalled popup.
 */
export function useTriggerFocusGuards(
  store: Pick<
    PopupStore,
    'positionerElement' | 'beforeContentFocusGuardRef' | 'beforeTriggerFocusGuardRef'
  > & {
    setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  },
  triggerElement: () => HTMLElement | null,
) {
  function closeAndFocus(event: FocusEvent, direction: 1 | -1) {
    const guard = event.currentTarget as HTMLElement;
    const positionerElement = untrack(store.positionerElement);
    store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event, guard));
    // Upstream's flushSync: the close must reach the DOM (the portal's outside
    // guards unmount) before the next tabbable element is looked up.
    flush();
    // Resolved after the close, which may change the tab order; from the trigger if the guard left.
    getTabbableNearElement(
      guard.isConnected ? guard : triggerElement(),
      direction,
      positionerElement,
    )?.focus();
  }

  return {
    handlePreFocusGuardFocus(event: FocusEvent) {
      closeAndFocus(event, -1);
    },
    handleFocusTargetFocus(event: FocusEvent) {
      const positionerElement = untrack(store.positionerElement);
      if (positionerElement && isOutsideEvent(event, positionerElement)) {
        store.beforeContentFocusGuardRef.current?.focus();
      } else {
        closeAndFocus(event, 1);
      }
    },
  };
}
