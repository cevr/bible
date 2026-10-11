// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetContent). Copyright 2026 Adobe, Apache-2.0 (`../LICENSE`); ported to Solid 2
// over this package's dialog popup (Base UI's) in place of React Aria's Dialog.
//
// The sheet's `role="dialog"` element, labelled by its title. It focuses
// itself once the sheet has scrolled in (not its first field, so no software
// keyboard opens), a modal one keeps Tab inside, and focus returns to what
// had it when the sheet closes. It fills the panel, and is the subject of the
// view timeline (`--sheet-timeline-<stack index>`) every swipe and stack
// animation runs along: not the panel, which an overscroll padding may keep
// from ever showing whole.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import {
  DialogPopupFocus,
  dialogPopupProps,
  useDialogOpenChangeComplete,
} from '../../dialog/popup/DialogPopup.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { TransitionStatus } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useSheetOverlayContext } from '../overlay/SheetOverlay.tsx';
import { useSheetRootContext } from '../root/SheetRootContext.ts';
import { timelineName } from '../utils/stack.ts';

interface SheetContentState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

interface SheetContentProps extends BaseUIComponentProps<'div', SheetContentState> {
  /**
   * What takes focus once the sheet has scrolled in, read then: an element,
   * `false` for nothing, `true` for the first tabbable element. The content
   * itself by default.
   */
  initialFocus?: (() => HTMLElement | boolean) | undefined;
}

const CONTENT_HOOK = { 'data-sheet-content': '' };

/**
 * The sheet's dialog, inside its popup.
 * Renders a `<div>` element.
 */
export function SheetContent(componentProps: SheetContentProps): JSX.Element {
  const { store, popupProps } = useDialogRootContext();
  const root = useSheetRootContext();
  const sheet = useSheetOverlayContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'initialFocus', 'id');

  useDialogOpenChangeComplete(store);
  onClientCleanup(() => store.setPopupElement(null));

  const state: SheetContentState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  const style = (): JSX.CSSProperties => {
    const { axis, before, after } = root.config();
    const viewport = axis === 'y' ? '100dvh' : '100dvw';
    return {
      width: '100%',
      height: '100%',
      'view-timeline-name': timelineName(sheet.index()),
      'view-timeline-axis': axis,
      // Crops the scroll container's scrollport to the viewport that shows.
      'view-timeline-inset': before && !after ? `${viewport} 0` : `0 ${viewport}`,
    };
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: popupTransitionStateMapping,
      props: [
        popupProps,
        dialogPopupProps(store, componentProps),
        CONTENT_HOOK,
        {
          get style() {
            return style();
          },
        },
        elementProps,
      ],
    });

  // Named, not written in the prop: the focus manager reads it from effect callbacks too, where
  // a compiled condition's memo may not be made.
  const scrollingIn = () => store.open() && !sheet.entered();

  return (
    <DialogPopupFocus
      store={store}
      deferred={scrollingIn()}
      initialFocus={
        componentProps.initialFocus === undefined
          ? () => untrack(store.popupElement) ?? true
          : componentProps.initialFocus
      }
    >
      {untrack(element)}
    </DialogPopupFocus>
  );
}
