// Upstream: packages/react/src/dialog/store/DialogStore.ts
//
// A dialog's state: the popup's (open, mounted, elements) plus whether it
// is modal, whether outside presses dismiss it, the ids of its title and
// description, and its viewport (a drawer is a dialog here). Opening and
// closing go through `setOpen`: `onOpenChange` first (which may cancel),
// then the interactions hear of it, then the state changes.
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';
import { createPopupStore, type PopupStore } from '../../utils/popups/popupStore.ts';

export type DialogChangeEventReason =
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closeWatcher
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.swipe
  | typeof REASONS.none;

export type DialogChangeEventDetails = BaseUIChangeEventDetails<DialogChangeEventReason>;

export interface DialogStoreOptions {
  openProp: () => boolean | undefined;
  modal: Accessor<boolean>;
  disablePointerDismissal: Accessor<boolean>;
  floatingId: string;
  onOpenChange: () => ((open: boolean, eventDetails: DialogChangeEventDetails) => void) | undefined;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface DialogStore extends PopupStore {
  modal: Accessor<boolean>;
  disablePointerDismissal: Accessor<boolean>;
  titleElementId: Accessor<string | undefined>;
  setTitleElementId: (id: string | undefined) => void;
  descriptionElementId: Accessor<string | undefined>;
  setDescriptionElementId: (id: string | undefined) => void;
  viewportElement: Accessor<HTMLElement | null>;
  setViewportElement: (element: HTMLElement | null) => void;
  readonly backdropRef: { current: HTMLElement | null };
  readonly internalBackdropRef: { current: HTMLElement | null };
  /** Asks the dialog to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, eventDetails: BaseUIChangeEventDetails) => void;
}

export function createDialogStore(options: DialogStoreOptions): DialogStore {
  const popup = createPopupStore({
    openProp: options.openProp,
    floatingId: options.floatingId,
    popupIsFloatingElement: true,
    onOpenChange: (open, details) => setOpen(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  const owned = { ownedWrite: true } as const;
  const [titleElementId, setTitleElementId] = createSignal<string | undefined>(undefined, owned);
  const [descriptionElementId, setDescriptionElementId] = createSignal<string | undefined>(
    undefined,
    owned,
  );
  const [viewportElement, setViewportElement] = createSignal<HTMLElement | null>(null, owned);

  function setOpen(nextOpen: boolean, eventDetails: BaseUIChangeEventDetails) {
    const details = eventDetails as DialogChangeEventDetails;
    untrack(options.onOpenChange)?.(nextOpen, details);
    if (details.isCanceled) {
      return;
    }
    popup.floatingRootContext.dispatchOpenChange(nextOpen, details);
    popup.applyOpenState(nextOpen, details.trigger);
  }

  return {
    ...popup,
    modal: options.modal,
    disablePointerDismissal: options.disablePointerDismissal,
    titleElementId,
    setTitleElementId: (id) => setTitleElementId(() => id),
    descriptionElementId,
    setDescriptionElementId: (id) => setDescriptionElementId(() => id),
    viewportElement,
    setViewportElement: (element) => setViewportElement(() => element),
    backdropRef: { current: null },
    internalBackdropRef: { current: null },
    setOpen,
  };
}
