// Upstream: packages/react/src/dialog/popup/DialogPopup.tsx
//
// The dialog's `role="dialog"` (or `alertdialog`) container, labelled by its
// title and described by its description. Focus moves into it on open (the
// first tabbable element, or the popup itself when opened by touch so no
// virtual keyboard pops up) and back to the trigger on close; a modal or
// trap-focus dialog keeps Tab inside. Arrow, Home and End keys stop here, so
// a composite widget around the dialog does not move. It carries the number
// of dialogs open nested in it as `--nested-dialogs`.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import {
  FloatingFocusManager,
  type InteractionType,
} from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { COMPOSITE_KEYS } from '../../internals/composite/composite.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { useDialogPortalContext } from '../portal/DialogPortal.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';
import type { DialogStore } from '../store/DialogStore.ts';
import {
  DialogPopupCssVars,
  dialogStateAttributesMapping,
} from '../utils/stateAttributesMapping.ts';

export type DialogFocusTarget =
  | boolean
  | { current: HTMLElement | null }
  | ((interactionType: InteractionType) => boolean | HTMLElement | null | void);

export interface DialogPopupState {
  open: boolean;
  transitionStatus: TransitionStatus;
  /** Whether the dialog is nested within a parent dialog. */
  nested: boolean;
  /** Whether a dialog nested in this one is open. */
  nestedDialogOpen: boolean;
}

export interface DialogPopupProps extends BaseUIComponentProps<'div', DialogPopupState> {
  /**
   * What takes focus on open: `false` nothing, `true` the default (the first
   * tabbable element, or the popup when opened by touch), an element, or a
   * function of how it opened.
   */
  initialFocus?: DialogFocusTarget | undefined;
  /**
   * What takes focus on close: `false` nothing, `true` the default (the
   * trigger, or what had focus before), an element, or a function of how it closed.
   */
  finalFocus?: DialogFocusTarget | undefined;
}

/** Stops the composite navigation keys from reaching a widget around the popup. */
export function stopCompositeKeys(event: KeyboardEvent) {
  if (COMPOSITE_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

export interface DialogPopupFocusProps {
  store: DialogStore;
  initialFocus: DialogFocusTarget | undefined;
  finalFocus: DialogFocusTarget | undefined;
  children: JSX.Element;
}

/** The focus manager a dialog or drawer popup renders in. */
export function DialogPopupFocus(props: DialogPopupFocusProps): JSX.Element {
  const store = props.store;
  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      openInteractionType={store.openMethod()}
      disabled={!store.mounted()}
      closeOnFocusOut={!store.disablePointerDismissal()}
      initialFocus={props.initialFocus}
      returnFocus={props.finalFocus}
      modal={store.modal() !== false}
      restoreFocus="popup"
      externalTree={store.floatingTree}
    >
      {props.children}
    </FloatingFocusManager>
  );
}

/** Calls the root's `onOpenChangeComplete(true)` once the popup's enter animations finish. */
export function useDialogOpenChangeComplete(store: DialogStore) {
  useOpenChangeComplete({
    open: store.open,
    element: store.popupElement,
    onComplete() {
      if (untrack(store.open)) {
        store.onOpenChangeComplete(true);
      }
    },
  });
}

/**
 * A container for the dialog contents.
 * Renders a `<div>` element.
 */
export function DialogPopup(componentProps: DialogPopupProps): JSX.Element {
  const { store, popupProps } = useDialogRootContext();
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

  useDialogOpenChangeComplete(store);
  onCleanup(() => store.setPopupElement(null));

  // A touch open focuses the popup itself, so no virtual keyboard opens.
  const defaultInitialFocus = (interactionType: InteractionType) =>
    interactionType === 'touch' ? untrack(store.popupElement) : true;

  const state: DialogPopupState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
    nested: store.nested,
    get nestedDialogOpen() {
      return store.nestedOpenDialogCount() > 0;
    },
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: dialogStateAttributesMapping,
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
            return { [DialogPopupCssVars.nestedDialogs]: String(store.nestedOpenDialogCount()) };
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
          ? defaultInitialFocus
          : componentProps.initialFocus
      }
      finalFocus={componentProps.finalFocus}
    >
      {untrack(element)}
    </DialogPopupFocus>
  );
}
