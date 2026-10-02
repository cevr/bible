// Upstream: packages/react/src/drawer/root/DrawerRoot.tsx,
// packages/react/src/drawer/root/useDrawerSnapPoints.ts
//
// Groups a drawer's parts. A drawer is a dialog underneath (the same root,
// in drawer mode) that a swipe in `swipeDirection` dismisses, and that may
// rest on snap points: heights it settles at, the first (or
// `defaultSnapPoint`) on open, back to it on close.
//
// The root resolves the snap points once, against the popup's measured
// height and the viewport's, for the popup and the viewport to share. It
// tracks the drawers nested in it (present, swiping, how far, the
// frontmost's height) so its popup can step back as they open. Inside a
// `Drawer.Provider` it reports its open state; on Android the system back
// gesture closes the topmost drawer.
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';

import {
  type DialogChangeEventDetails,
  type DialogChangeEventReason,
  type DialogRootActions,
  DialogRootInternal,
} from '../../dialog/root/DialogRoot.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { DialogModal } from '../../dialog/store/DialogStore.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { addEventListener, NOOP, ownerDocument, ownerWindow } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useControlled } from '../../utils/useControlled.ts';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext.ts';
import {
  DrawerRootContext,
  type DrawerSnapPointChangeEventDetails,
  type DrawerSwipeDirection,
  useDrawerRootContextOptional,
} from './DrawerRootContext.ts';
import { type DrawerSnapPoint, resolveActiveSnapPoint, resolveSnapPoints } from './snapPoints.ts';

export type { DrawerSnapPoint, DrawerSwipeDirection };

export type DrawerRootChangeEventReason = DialogChangeEventReason;
export type DrawerRootChangeEventDetails = DialogChangeEventDetails;
export type DrawerRootSnapPointChangeEventReason = DialogChangeEventReason;
export type DrawerRootSnapPointChangeEventDetails = DrawerSnapPointChangeEventDetails;
export type DrawerRootActions = DialogRootActions;

export interface DrawerRootState {}

export interface DrawerRootProps {
  open?: boolean | undefined;
  /** @default false */
  defaultOpen?: boolean | undefined;
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
  /** Receives the imperative actions. */
  actionsRef?: { current: DrawerRootActions | null } | undefined;
  /** The direction a swipe dismisses the drawer in. @default 'down' */
  swipeDirection?: DrawerSwipeDirection | undefined;
  /**
   * Heights the drawer settles at: a number up to 1 is a fraction of the
   * viewport's height, a larger number is pixels, and a string is `px` or
   * `rem` (`'148px'`, `'30rem'`).
   */
  snapPoints?: DrawerSnapPoint[] | undefined;
  /** Whether a fast swipe moves one snap point at most, so distance alone picks it. @default false */
  snapToSequentialPoints?: boolean | undefined;
  /** The active snap point; pair it with `onSnapPointChange`. */
  snapPoint?: DrawerSnapPoint | null | undefined;
  /** The first active snap point when uncontrolled; the first snap point by default. */
  defaultSnapPoint?: DrawerSnapPoint | null | undefined;
  onSnapPointChange?:
    | ((
        snapPoint: DrawerSnapPoint | null,
        eventDetails: DrawerRootSnapPointChangeEventDetails,
      ) => void)
    | undefined;
  children?: JSX.Element;
}

/**
 * Groups all parts of the drawer.
 * Doesn't render its own HTML element.
 */
export function DrawerRoot(props: DrawerRootProps): JSX.Element {
  const defaultSnapPoint = (): DrawerSnapPoint | null =>
    props.defaultSnapPoint !== undefined ? props.defaultSnapPoint : (props.snapPoints?.[0] ?? null);

  const [ownSnapPoint, setOwnSnapPoint] = useControlled<DrawerSnapPoint | null>({
    controlled: () => props.snapPoint,
    default: defaultSnapPoint,
  });

  const setActiveSnapPoint = (
    snapPoint: DrawerSnapPoint | null,
    eventDetails?: DrawerSnapPointChangeEventDetails,
  ) => {
    const details = eventDetails ?? createChangeEventDetails(REASONS.none);
    props.onSnapPointChange?.(snapPoint, details);
    if (details.isCanceled) {
      return;
    }
    setOwnSnapPoint(snapPoint);
  };

  // An uncontrolled snap point that is no longer listed falls back to the default.
  const activeSnapPoint = createMemo((): DrawerSnapPoint | null => {
    const active = ownSnapPoint();
    const snapPoints = props.snapPoints;
    if (props.snapPoint !== undefined || !snapPoints || snapPoints.length === 0) {
      return active;
    }
    if (active === null || !snapPoints.some((point) => Object.is(point, active))) {
      return defaultSnapPoint();
    }
    return active;
  });

  const handleOpenChange = (nextOpen: boolean, eventDetails: DrawerRootChangeEventDetails) => {
    props.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    if (!nextOpen && props.snapPoints && props.snapPoints.length > 0) {
      setActiveSnapPoint(
        untrack(defaultSnapPoint),
        createChangeEventDetails(eventDetails.reason, eventDetails.event, eventDetails.trigger),
      );
    }
  };

  return (
    <DialogRootInternal
      mode="drawer"
      open={props.open}
      defaultOpen={props.defaultOpen}
      modal={props.modal}
      disablePointerDismissal={props.disablePointerDismissal}
      actionsRef={props.actionsRef}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <DrawerRootScope
        swipeDirection={props.swipeDirection ?? 'down'}
        snapToSequentialPoints={props.snapToSequentialPoints ?? false}
        snapPoints={props.snapPoints}
        activeSnapPoint={activeSnapPoint()}
        setActiveSnapPoint={setActiveSnapPoint}
      >
        {props.children}
      </DrawerRootScope>
    </DialogRootInternal>
  );
}

interface DrawerRootScopeProps {
  swipeDirection: DrawerSwipeDirection;
  snapToSequentialPoints: boolean;
  snapPoints: DrawerSnapPoint[] | undefined;
  activeSnapPoint: DrawerSnapPoint | null;
  setActiveSnapPoint: DrawerRootContext['setActiveSnapPoint'];
  children?: JSX.Element;
}

interface CloseWatcherLike extends EventTarget {
  destroy: () => void;
}

/** The drawer's own state, built where the dialog store is in reach. */
function DrawerRootScope(props: DrawerRootScopeProps): JSX.Element {
  const { store } = useDialogRootContext();
  const parent = useDrawerRootContextOptional();
  const provider = useDrawerProviderContext();
  const owned = { ownedWrite: true } as const;

  const [popupHeight, setPopupHeight] = createSignal(0, owned);
  const [frontmostHeight, setFrontmostHeight] = createSignal(0, owned);
  const [hasNestedDrawer, setHasNestedDrawer] = createSignal(false, owned);
  const [nestedSwiping, setNestedSwiping] = createSignal(false, owned);
  const [nestedSwipeProgress, setNestedSwipeProgress] = createSignal(0, owned);
  const [viewportHeight, setViewportHeight] = createSignal(0, owned);
  const [rootFontSize, setRootFontSize] = createSignal(16, owned);
  let isNestedDrawerOpen = false;

  // The viewport's height sizes the fractional snap points.
  createEffect(
    () => store.viewportElement(),
    (viewportElement) => {
      const measure = () => {
        const html = ownerDocument(viewportElement).documentElement;
        setViewportHeight(viewportElement ? viewportElement.offsetHeight : html.clientHeight);
        const fontSize = Number.parseFloat(getComputedStyle(html).fontSize);
        if (Number.isFinite(fontSize)) {
          setRootFontSize(fontSize);
        }
      };
      measure();
      if (!viewportElement || typeof ResizeObserver !== 'function') {
        return undefined;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(viewportElement);
      return () => {
        observer.disconnect();
      };
    },
  );

  const measurements = () => ({
    viewportHeight: viewportHeight(),
    popupHeight: popupHeight(),
    rootFontSize: rootFontSize(),
  });
  const resolvedSnapPoints = createMemo(() => resolveSnapPoints(props.snapPoints, measurements()));
  const activeSnapPointOffset = createMemo(
    () =>
      resolveActiveSnapPoint(props.activeSnapPoint, resolvedSnapPoints(), measurements())?.offset ??
      null,
  );

  const notifyParentSwipeProgressChange = parent?.onNestedSwipeProgressChange;
  const notifyParentSwipingChange = parent?.onNestedSwipingChange;

  const context: DrawerRootContext = {
    swipeDirection: () => props.swipeDirection,
    swipeAreaActiveRef: { current: false },
    snapToSequentialPoints: () => props.snapToSequentialPoints,
    snapPoints: () => props.snapPoints,
    activeSnapPoint: () => props.activeSnapPoint,
    setActiveSnapPoint: (snapPoint, details) => props.setActiveSnapPoint(snapPoint, details),
    resolvedSnapPoints,
    activeSnapPointOffset,
    popupHeight,
    onPopupHeightChange(height) {
      setPopupHeight(height);
      if (!isNestedDrawerOpen && height > 0) {
        setFrontmostHeight(height);
      }
    },
    frontmostHeight,
    hasNestedDrawer,
    nestedSwiping,
    nestedSwipeProgress,
    onNestedDrawerPresenceChange: (present) => setHasNestedDrawer(present),
    onNestedFrontmostHeightChange(height) {
      if (height > 0) {
        isNestedDrawerOpen = true;
        setFrontmostHeight(height);
        return;
      }
      isNestedDrawerOpen = false;
      const ownHeight = untrack(popupHeight);
      if (ownHeight > 0) {
        setFrontmostHeight(ownHeight);
      }
    },
    onNestedSwipingChange(swiping) {
      setNestedSwiping(swiping);
      notifyParentSwipingChange?.(swiping);
    },
    onNestedSwipeProgressChange(progress) {
      setNestedSwipeProgress(Number.isFinite(progress) ? progress : 0);
      notifyParentSwipeProgressChange?.(progress);
    },
    notifyParentFrontmostHeight: parent?.onNestedFrontmostHeightChange,
    notifyParentSwipingChange,
    notifyParentSwipeProgressChange,
    notifyParentHasNestedDrawer: parent?.onNestedDrawerPresenceChange,
  };

  if (provider) {
    createEffect(
      () => store.open(),
      (open) => {
        provider.setDrawerOpen(store, open);
      },
    );
    onCleanup(() => provider.removeDrawer(store));
  }

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
