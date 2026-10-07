// Upstream: packages/react/src/dialog/root/DialogRoot.tsx,
// packages/react/src/dialog/root/useRenderDialogRoot.tsx,
// packages/react/src/dialog/root/useDialogRoot.ts
//
// Groups a dialog's parts and owns its state. The same root serves dialogs
// and drawers, each opened by its owner's `open` (upstream's trigger is left
// out). It wires what the parts share: Escape and outside presses close the
// dialog, and page scroll locks while a modal dialog is open. Upstream's
// nested dialog stacks are left out: no page opens a dialog inside another.
//
// An outside press on a modal dialog closes it only on its own backdrop (or
// the viewport around it), so a press on another dialog's backdrop or a
// popup's never does.
import type { JSX } from '@solidjs/web';
import { createUniqueId, untrack } from 'solid-js';

import { useDismiss } from '../../floating-ui-solid/hooks/useDismiss.ts';
import { contains, getTarget } from '../../utils/dom.ts';
import { useScrollLock } from '../../utils/useScrollLock.ts';
import {
  createDialogStore,
  type DialogChangeEventDetails,
  type DialogChangeEventReason,
} from '../store/DialogStore.ts';
import { DialogRootContext } from './DialogRootContext.ts';

export type { DialogChangeEventDetails, DialogChangeEventReason };

export interface DialogRootState {}

export interface DialogRootProps {
  open?: boolean | undefined;
  /**
   * Whether the open dialog is modal: focus trapped, page scroll locked and
   * outside pointer interaction blocked. Otherwise the rest of the page stays
   * interactive. @default true
   */
  modal?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: DialogChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether outside presses leave the dialog open (for a non-modal dialog,
   * also focus moving outside). @default false
   */
  disablePointerDismissal?: boolean | undefined;
  children?: JSX.Element;
}

/**
 * Groups all parts of the dialog.
 * Doesn't render its own HTML element.
 */
export function DialogRoot(props: DialogRootProps): JSX.Element {
  const modal = () => props.modal ?? true;
  const disablePointerDismissal = () => props.disablePointerDismissal ?? false;

  const store = createDialogStore({
    openProp: () => props.open,
    modal,
    disablePointerDismissal,
    floatingId: createUniqueId(),
    onOpenChange: () => props.onOpenChange,
    onOpenChangeComplete: () => props.onOpenChangeComplete,
  });

  const dismiss = useDismiss(store.floatingRootContext, {
    outsidePressEvent() {
      if (store.internalBackdropRef.current || store.backdropRef.current) {
        return 'intentional';
      }
      return { mouse: 'intentional', touch: 'sloppy' };
    },
    outsidePress(event) {
      // Only the main button; a touch counts when it is a single finger.
      if ('button' in event && event.button !== 0) {
        return false;
      }
      if ('touches' in event) {
        if (event.type === 'touchend') {
          if (event.changedTouches.length !== 1 || event.touches.length !== 0) {
            return false;
          }
        } else if (event.touches.length !== 1) {
          return false;
        }
      }
      const target = getTarget(event) as Element | null;
      if (untrack(disablePointerDismissal)) {
        return false;
      }
      if (untrack(modal)) {
        // Only this dialog's own backdrop (or what contains the popup, its viewport) dismisses it,
        // so dialogs open side by side close one at a time.
        const internalBackdrop = store.internalBackdropRef.current;
        const backdrop = store.backdropRef.current;
        if (!internalBackdrop && !backdrop) {
          return true;
        }
        return (
          internalBackdrop === target ||
          backdrop === target ||
          (contains(target, untrack(store.popupElement)) &&
            !target?.hasAttribute('data-base-ui-portal'))
        );
      }
      return true;
    },
  });

  useScrollLock(() => store.open() && modal(), store.popupElement);

  const context: DialogRootContext = {
    store,
    popupProps: dismiss.floating,
  };

  return <DialogRootContext value={context}>{props.children}</DialogRootContext>;
}
