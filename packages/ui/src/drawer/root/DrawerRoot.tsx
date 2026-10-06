// Upstream: packages/react/src/drawer/root/DrawerRoot.tsx
//
// Groups a drawer's parts. A drawer is a dialog underneath (the same root)
// that a swipe in `swipeDirection` dismisses. On Android the system back
// gesture closes it when no dialog is open on top of it. Upstream's snap
// points, nested drawer stacks, swipe area and provider indent are left out.
import type { JSX } from '@solidjs/web';
import { createEffect, untrack } from 'solid-js';

import {
  type DialogChangeEventDetails,
  type DialogChangeEventReason,
  DialogRoot,
} from '../../dialog/root/DialogRoot.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { DialogModal } from '../../dialog/store/DialogStore.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { addEventListener, NOOP, ownerWindow } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { DrawerRootContext, type DrawerSwipeDirection } from './DrawerRootContext.ts';

export type { DrawerSwipeDirection };

export type DrawerRootChangeEventReason = DialogChangeEventReason;
export type DrawerRootChangeEventDetails = DialogChangeEventDetails;

export interface DrawerRootState {}

export interface DrawerRootProps {
  open?: boolean | undefined;
  /**
   * Whether the open drawer is modal.
   * - `true`: focus is trapped, page scroll is locked, and outside pointer interaction is blocked.
   * - `false`: the rest of the page stays interactive.
   * - `'trap-focus'`: focus is trapped, but page scroll and outside pointer interaction are not blocked.
   * @default true
   */
  modal?: DialogModal | undefined;
  onOpenChange?: ((open: boolean, eventDetails: DrawerRootChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether outside presses leave the drawer open (for a non-modal drawer,
   * also focus moving outside). @default false
   */
  disablePointerDismissal?: boolean | undefined;
  /** The direction a swipe dismisses the drawer in. @default 'down' */
  swipeDirection?: DrawerSwipeDirection | undefined;
  children?: JSX.Element;
}

/**
 * Groups all parts of the drawer.
 * Doesn't render its own HTML element.
 */
export function DrawerRoot(props: DrawerRootProps): JSX.Element {
  return (
    <DialogRoot
      open={props.open}
      modal={props.modal}
      disablePointerDismissal={props.disablePointerDismissal}
      onOpenChange={props.onOpenChange}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <DrawerRootScope swipeDirection={props.swipeDirection ?? 'down'}>
        {props.children}
      </DrawerRootScope>
    </DialogRoot>
  );
}

interface CloseWatcherLike extends EventTarget {
  destroy: () => void;
}

/** The drawer's own state, built where the dialog store is in reach. */
function DrawerRootScope(props: {
  swipeDirection: DrawerSwipeDirection;
  children?: JSX.Element;
}): JSX.Element {
  const { store } = useDialogRootContext();

  const context: DrawerRootContext = {
    swipeDirection: () => props.swipeDirection,
  };

  // The Android back gesture closes the topmost drawer (Chromium's CloseWatcher).
  // Desktop keeps Escape to `useDismiss`, so nesting resolves one way.
  createEffect(
    () => [store.open(), store.nestedOpenDialogCount() === 0, store.popupElement()] as const,
    ([open, isTopmost, popupElement]) => {
      if (!open || !isTopmost || !platform.os.android) {
        return undefined;
      }
      const win = ownerWindow(popupElement) as Window & {
        CloseWatcher?: new () => CloseWatcherLike;
      };
      const CloseWatcherCtor = win.CloseWatcher;
      if (!CloseWatcherCtor) {
        return undefined;
      }
      const closeWatcher = new CloseWatcherCtor();
      // The browser destroys the watcher before `close`, so the request is handled
      // on `cancel`, where it can still be prevented.
      const unsubscribe = addEventListener(closeWatcher, 'cancel', (event: Event) => {
        if (!untrack(store.open)) {
          return;
        }
        const details = createChangeEventDetails(REASONS.closeWatcher, event);
        if (!event.cancelable) {
          // One close request per user activation may be prevented; later ones close
          // regardless, like a native `<dialog>`.
          details.cancel = NOOP;
        }
        store.setOpen(false, details);
        if (details.isCanceled) {
          event.preventDefault();
        }
      });
      return () => {
        unsubscribe();
        closeWatcher.destroy();
      };
    },
  );

  return <DrawerRootContext value={context}>{props.children}</DrawerRootContext>;
}
