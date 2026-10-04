// Upstream: packages/react/src/drawer/popup/DrawerPopup.tsx
//
// The drawer's `role="dialog"` container. It focuses itself on open (not
// its first field, so no virtual keyboard opens), keeps focus inside like a
// dialog's popup, and measures its own height for the snap points and for
// the drawers stacked under it.
//
// Its swipe arrives as CSS variables for the consumer's transform:
// `--drawer-swipe-movement-x/y` while dragged, `--drawer-snap-point-offset`
// for the active snap point (negative for an upward drawer), and
// `--drawer-swipe-strength` to shorten the exit transition after a hard
// flick. A drawer with others open on top of it carries
// `data-nested-drawer-open`, `--nested-drawers` and
// `--drawer-frontmost-height` (the height of the drawer in front).
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit, onCleanup, untrack } from 'solid-js';

import {
  type DialogFocusTarget,
  DialogPopupFocus,
  stopCompositeKeys,
  useDialogOpenChangeComplete,
} from '../../dialog/popup/DialogPopup.tsx';
import { useDialogPortalContext } from '../../dialog/portal/DialogPortal.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { type DrawerSwipeDirection, useDrawerRootContext } from '../root/DrawerRootContext.ts';
import { getSnapPointSwipeMovement } from '../root/snapPoints.ts';
import {
  DrawerBackdropCssVars,
  DrawerPopupCssVars,
  DrawerPopupDataAttributes,
} from '../utils/drawerAttributes.ts';
import { useDrawerViewportContext } from '../viewport/DrawerViewportContext.ts';

let swipeVarsRegistered = false;

/**
 * Registers the high-frequency swipe variables as non-inherited, so a drag
 * does not restyle the popup's whole subtree on every move. Nothing inside
 * the drawer reads them.
 */
function registerSwipeVars() {
  if (swipeVarsRegistered) {
    return;
  }
  swipeVarsRegistered = true;
  if (typeof CSS === 'undefined' || !('registerProperty' in CSS)) {
    return;
  }
  const properties = [
    { name: DrawerPopupCssVars.swipeMovementX, syntax: '<length>', initialValue: '0px' },
    { name: DrawerPopupCssVars.swipeMovementY, syntax: '<length>', initialValue: '0px' },
    { name: DrawerPopupCssVars.snapPointOffset, syntax: '<length>', initialValue: '0px' },
    { name: DrawerBackdropCssVars.swipeProgress, syntax: '<number>', initialValue: '0' },
    { name: DrawerPopupCssVars.swipeStrength, syntax: '<number>', initialValue: '1' },
  ];
  for (const property of properties) {
    try {
      CSS.registerProperty({ ...property, inherits: false });
    } catch {
      // Already registered.
    }
  }
}

export interface DrawerPopupState {
  open: boolean;
  transitionStatus: TransitionStatus;
  /** Whether the active snap point is the full height (`1`). */
  expanded: boolean;
  /** Whether the drawer is nested within another drawer or dialog. */
  nested: boolean;
  /** Whether a drawer nested in this one is open. */
  nestedDrawerOpen: boolean;
  /** Whether a drawer nested in this one is being swiped. */
  nestedDrawerSwiping: boolean;
  /** The direction a swipe dismisses the drawer in. */
  swipeDirection: DrawerSwipeDirection;
  /** Whether the drawer is being swiped. */
  swiping: boolean;
}

export interface DrawerPopupProps extends BaseUIComponentProps<'div', DrawerPopupState> {
  /**
   * What takes focus on open: `false` nothing, `true` the first tabbable
   * element, an element, or a function of how it opened. The popup itself by
   * default.
   */
  initialFocus?: DialogFocusTarget | undefined;
  /**
   * What takes focus on close: `false` nothing, `true` the default (the
   * trigger, or what had focus before), an element, or a function of how it closed.
   */
  finalFocus?: DialogFocusTarget | undefined;
}

const EXPANDED_HOOK = { [DrawerPopupDataAttributes.expanded]: '' };
const NESTED_DRAWER_OPEN_HOOK = { [DrawerPopupDataAttributes.nestedDrawerOpen]: '' };
const NESTED_DRAWER_SWIPING_HOOK = { [DrawerPopupDataAttributes.nestedDrawerSwiping]: '' };
const SWIPING_HOOK = { [DrawerPopupDataAttributes.swiping]: '' };

const drawerPopupStateAttributesMapping: StateAttributesMapping<DrawerPopupState> = {
  ...popupTransitionStateMapping,
  expanded: (value) => (value ? EXPANDED_HOOK : null),
  nestedDrawerOpen: (value) => (value ? NESTED_DRAWER_OPEN_HOOK : null),
  nestedDrawerSwiping: (value) => (value ? NESTED_DRAWER_SWIPING_HOOK : null),
  swipeDirection: (value) => ({ [DrawerPopupDataAttributes.swipeDirection]: value }),
  swiping: (value) => (value ? SWIPING_HOOK : null),
};

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 */
export function DrawerPopup(componentProps: DrawerPopupProps): JSX.Element {
  const { store, popupProps } = useDialogRootContext();
  const drawer = useDrawerRootContext();
  const swipe = useDrawerViewportContext();
  useDialogPortalContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'initialFocus',
    'finalFocus',
    'id',
  );

  if (!swipe) {
    console.error(
      'Base UI: <Drawer.Popup> expected to be rendered within <Drawer.Viewport>. Omitting the ' +
        'viewport disables drawer swipe handling and touch scroll locking. Wrap ' +
        '<Drawer.Popup> in <Drawer.Viewport>.',
    );
  }

  useDialogOpenChangeComplete(store);
  onCleanup(() => store.setPopupElement(null));

  const nestedDrawerOpen = () => store.nestedOpenDrawerCount() > 0;
  const swiping = () => swipe?.swiping() ?? false;

  const [popupHeight, setPopupHeight] = createSignal(0, { ownedWrite: true });
  let measuredHeight = 0;

  function measureHeight(popup: HTMLElement) {
    const offsetHeight = popup.offsetHeight;
    const frontmostHeight = untrack(drawer.frontmostHeight);
    // Skip while a taller drawer in front still stretches this one.
    if (measuredHeight > 0 && frontmostHeight > measuredHeight && offsetHeight > measuredHeight) {
      return;
    }
    // With a drawer open on top, this one keeps the height it had.
    if (measuredHeight > 0 && untrack(drawer.hasNestedDrawer)) {
      setPopupHeight(measuredHeight);
      drawer.onPopupHeightChange(measuredHeight);
      return;
    }
    if (offsetHeight === measuredHeight) {
      return;
    }
    measuredHeight = offsetHeight;
    setPopupHeight(offsetHeight);
    drawer.onPopupHeightChange(offsetHeight);
  }

  createEffect(
    () => [store.mounted(), store.popupElement(), nestedDrawerOpen()] as const,
    ([mounted, popup]) => {
      if (!mounted) {
        measuredHeight = 0;
        setPopupHeight(0);
        drawer.onPopupHeightChange(0);
        return undefined;
      }
      if (!popup) {
        return undefined;
      }
      registerSwipeVars();
      measureHeight(popup);
      if (typeof ResizeObserver !== 'function') {
        return undefined;
      }
      const observer = new ResizeObserver(() => measureHeight(popup));
      observer.observe(popup);
      return () => {
        observer.disconnect();
      };
    },
  );

  // A nested drawer's swipe progress, for this drawer to follow it back into place.
  createEffect(
    () => [store.popupElement(), drawer.nestedSwipeProgress()] as const,
    ([popup, progress]) => {
      if (!popup) {
        return undefined;
      }
      popup.style.setProperty(
        DrawerBackdropCssVars.swipeProgress,
        progress > 0 ? `${progress}` : '0',
      );
      return () => {
        popup.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      };
    },
  );

  const notifyParentFrontmostHeight = drawer.notifyParentFrontmostHeight;
  if (notifyParentFrontmostHeight) {
    createEffect(
      () => [store.open(), drawer.frontmostHeight()] as const,
      ([open, frontmostHeight]) => {
        if (!open) {
          return undefined;
        }
        notifyParentFrontmostHeight(frontmostHeight);
        return () => {
          notifyParentFrontmostHeight(0);
        };
      },
    );
  }

  const notifyParentHasNestedDrawer = drawer.notifyParentHasNestedDrawer;
  if (notifyParentHasNestedDrawer) {
    createEffect(
      () => store.open() || store.transitionStatus() === 'ending',
      (present) => {
        notifyParentHasNestedDrawer(present);
        return () => {
          notifyParentHasNestedDrawer(false);
        };
      },
    );
  }

  const state: DrawerPopupState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
    get expanded() {
      return drawer.activeSnapPoint() === 1;
    },
    nested: store.nested,
    get nestedDrawerOpen() {
      return nestedDrawerOpen();
    },
    get nestedDrawerSwiping() {
      return drawer.nestedSwiping();
    },
    get swipeDirection() {
      return drawer.swipeDirection();
    },
    get swiping() {
      return swiping();
    },
  };

  const style = (): JSX.CSSProperties => {
    const direction = drawer.swipeDirection();
    const applySnapPoints =
      (drawer.snapPoints()?.length ?? 0) > 0 && (direction === 'down' || direction === 'up');
    const snapOffset = drawer.activeSnapPointOffset();
    let snapPointOffset = '0px';
    if (applySnapPoints && snapOffset !== null) {
      snapPointOffset = `${direction === 'up' ? -snapOffset : snapOffset}px`;
    }

    let dragStyles: Record<string, string | undefined> = swipe ? swipe.getDragStyles() : {};
    if (applySnapPoints && direction === 'down') {
      // A downward drawer on snap points moves by the variable alone, damped past the top.
      const movement = Number.parseFloat(String(dragStyles[DrawerPopupCssVars.swipeMovementY]));
      dragStyles = { ...dragStyles, transform: undefined };
      if (swiping() && Number.isFinite(movement)) {
        dragStyles[DrawerPopupCssVars.swipeMovementY] =
          `${getSnapPointSwipeMovement(snapOffset ?? 0, movement)}px`;
      }
    }

    const height = popupHeight();
    const useAutoHeight = !drawer.hasNestedDrawer() && store.transitionStatus() !== 'ending';
    const frontmostHeight = drawer.frontmostHeight();
    const swipeStrength = swipe?.swipeStrength() ?? null;

    return {
      ...dragStyles,
      [DrawerBackdropCssVars.swipeProgress]: '0',
      [DrawerPopupCssVars.nestedDrawers]: String(store.nestedOpenDrawerCount()),
      [DrawerPopupCssVars.height]: height && !useAutoHeight ? `${height}px` : undefined,
      [DrawerPopupCssVars.snapPointOffset]: snapPointOffset,
      [DrawerPopupCssVars.frontmostHeight]: frontmostHeight ? `${frontmostHeight}px` : undefined,
      [DrawerPopupCssVars.swipeStrength]:
        swipeStrength !== null && Number.isFinite(swipeStrength) && swipeStrength > 0
          ? `${swipeStrength}`
          : '1',
    };
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: drawerPopupStateAttributesMapping,
      props: [
        popupProps,
        {
          get id() {
            return componentProps.id || store.floatingId;
          },
          get 'aria-labelledby'() {
            return store.titleElementId();
          },
          get 'aria-describedby'() {
            return store.descriptionElementId();
          },
          role: store.role,
          ...FOCUSABLE_POPUP_PROPS,
          get hidden() {
            return !store.mounted() || undefined;
          },
          onKeyDown: stopCompositeKeys,
          get style() {
            return style();
          },
        },
        elementProps,
      ],
    });

  return (
    <DialogPopupFocus
      store={store}
      initialFocus={
        componentProps.initialFocus === undefined
          ? () => untrack(store.popupElement)
          : componentProps.initialFocus
      }
      finalFocus={componentProps.finalFocus}
    >
      {untrack(element)}
    </DialogPopupFocus>
  );
}
