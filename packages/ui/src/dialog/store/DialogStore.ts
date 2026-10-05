// Upstream: packages/react/src/dialog/store/DialogStore.ts
//
// A dialog's state: the popup's (open, mounted, elements) plus whether it
// is modal, whether outside presses dismiss it, the ids of its title and
// description, its viewport, and how many dialogs are open nested in it
// (a drawer is a dialog here). Opening and
// closing go through `setOpen`: `onOpenChange` first (which may cancel),
// then the interactions hear of it, then the state changes.
//
// Nested dialogs share one floating tree, so a press inside a child dialog
// is inside its parents too.
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { FloatingContext } from '../../floating-ui-solid/FloatingRootContext.ts';
import type { FloatingTreeStore } from '../../floating-ui-solid/FloatingTreeStore.ts';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../../internals/reasons.ts';
import {
  attachPreventUnmountOnClose,
  createPopupStore,
  type PopupStore,
} from '../../utils/popups/popupStore.ts';

export type DialogChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closeWatcher
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.imperativeAction
  | typeof REASONS.swipe
  | typeof REASONS.none;

export type DialogChangeEventDetails = BaseUIChangeEventDetails<DialogChangeEventReason> & {
  /** Keeps the popup mounted after closing until the `unmount` action is called. */
  preventUnmountOnClose: () => void;
};

export type DialogModal = boolean | 'trap-focus';

export interface DialogStoreOptions {
  openProp: () => boolean | undefined;
  defaultOpen: boolean;
  modal: Accessor<DialogModal>;
  disablePointerDismissal: Accessor<boolean>;
  /** Whether the dialog is nested in another dialog. */
  nested: boolean;
  /** Whether the dialog sits inside another floating element (a menu). */
  floatingNested: boolean;
  floatingId: string;
  floatingTree: FloatingTreeStore;
  floatingNodeId: string;
  onOpenChange: () => ((open: boolean, eventDetails: DialogChangeEventDetails) => void) | undefined;
  onOpenChangeComplete: () => ((open: boolean) => void) | undefined;
}

export interface DialogStore extends PopupStore {
  modal: Accessor<DialogModal>;
  disablePointerDismissal: Accessor<boolean>;
  readonly nested: boolean;
  /** How many dialogs are open nested in this one (a chain counts each level). */
  nestedOpenDialogCount: Accessor<number>;
  /** A nested dialog reports its open count here; a close reports zero. */
  setNestedOpenDialogCount: (count: number) => void;
  titleElementId: Accessor<string | undefined>;
  setTitleElementId: (id: string | undefined) => void;
  descriptionElementId: Accessor<string | undefined>;
  setDescriptionElementId: (id: string | undefined) => void;
  viewportElement: Accessor<HTMLElement | null>;
  setViewportElement: (element: HTMLElement | null) => void;
  readonly backdropRef: { current: HTMLElement | null };
  readonly internalBackdropRef: { current: HTMLElement | null };
  readonly floatingTree: FloatingTreeStore;
  readonly floatingNodeId: string;
  /** Asks the dialog to open or close (through `onOpenChange`, which may cancel). */
  setOpen: (open: boolean, eventDetails: BaseUIChangeEventDetails) => void;
}

export function createDialogStore(options: DialogStoreOptions): DialogStore {
  const popup = createPopupStore({
    openProp: options.openProp,
    defaultOpen: options.defaultOpen,
    floatingId: options.floatingId,
    nested: options.floatingNested,
    popupIsFloatingElement: true,
    onOpenChange: (open, details) => setOpen(open, details),
    onOpenChangeComplete: options.onOpenChangeComplete,
  });

  const owned = { ownedWrite: true } as const;
  const [nestedOpenDialogCount, setNestedOpenDialogCount] = createSignal(0, owned);
  const [titleElementId, setTitleElementId] = createSignal<string | undefined>(undefined, owned);
  const [descriptionElementId, setDescriptionElementId] = createSignal<string | undefined>(
    undefined,
    owned,
  );
  const [viewportElement, setViewportElement] = createSignal<HTMLElement | null>(null, owned);

  function setOpen(nextOpen: boolean, eventDetails: BaseUIChangeEventDetails) {
    const details = eventDetails as DialogChangeEventDetails;
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(details);
    untrack(options.onOpenChange)?.(nextOpen, details);
    if (details.isCanceled) {
      return;
    }
    popup.floatingRootContext.dispatchOpenChange(nextOpen, details);
    popup.applyOpenState(nextOpen, details.trigger, shouldPreventUnmountOnClose());
  }

  // What the floating tree and the interactions read of this dialog.
  const floatingContext: FloatingContext = {
    get open() {
      return untrack(popup.open);
    },
    nodeId: options.floatingNodeId,
    placement: null,
    elements: {
      get floating() {
        return untrack(popup.popupElement);
      },
      get domReference() {
        return untrack(popup.floatingRootContext.domReferenceElement);
      },
    },
    dataRef: popup.floatingRootContext.dataRef,
  };
  popup.floatingRootContext.dataRef.current.floatingContext = floatingContext;
  const node = options.floatingTree.nodesRef.current.find((n) => n.id === options.floatingNodeId);
  if (node) {
    node.context = floatingContext;
  }

  return {
    ...popup,
    modal: options.modal,
    disablePointerDismissal: options.disablePointerDismissal,
    nested: options.nested,
    nestedOpenDialogCount,
    setNestedOpenDialogCount: (count) => setNestedOpenDialogCount(count),
    titleElementId,
    setTitleElementId: (id) => setTitleElementId(() => id),
    descriptionElementId,
    setDescriptionElementId: (id) => setDescriptionElementId(() => id),
    viewportElement,
    setViewportElement: (element) => setViewportElement(() => element),
    backdropRef: { current: null },
    internalBackdropRef: { current: null },
    floatingTree: options.floatingTree,
    floatingNodeId: options.floatingNodeId,
    setOpen,
  };
}
