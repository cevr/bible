// Upstream: packages/react/src/dialog/popup/DialogPopup.tsx
//
// The dialog's `role="dialog"` container, labelled by its title and
// described by its description. Focus moves into it on open (the first
// tabbable element) and, on close, back to what had it before the owner
// opened the dialog; a modal dialog keeps Tab inside. Arrow, Home and End
// keys stop here, so a composite widget around the dialog does not move.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { FloatingFocusManager } from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { COMPOSITE_KEYS } from '../../internals/composite/composite.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useDialogPortalContext } from '../portal/DialogPortal.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';
import type { DialogStore } from '../store/DialogStore.ts';

interface DialogPopupState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

interface DialogPopupProps extends BaseUIComponentProps<'div', DialogPopupState> {}

/** Stops the composite navigation keys from reaching a widget around the popup. */
export function stopCompositeKeys(event: KeyboardEvent) {
  if (COMPOSITE_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

interface DialogPopupFocusProps {
  store: DialogStore;
  /**
   * What takes focus on open, read as the popup opens: an element, `false`
   * for nothing, `true` for the first tabbable element. Without it,
   * the first tabbable element.
   */
  initialFocus?: (() => HTMLElement | boolean) | undefined;
  children: JSX.Element;
}

/** The focus manager a dialog or drawer popup renders in. */
export function DialogPopupFocus(props: DialogPopupFocusProps): JSX.Element {
  const store = props.store;
  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      // The owner's `open` opens it: a programmatic open, so focus returns to what had it.
      openInteractionType={null}
      disabled={!store.mounted()}
      closeOnFocusOut={!store.disablePointerDismissal()}
      initialFocus={props.initialFocus}
      modal={store.modal()}
      restoreFocus="popup"
    >
      {props.children}
    </FloatingFocusManager>
  );
}

/** The element props a dialog or drawer popup shares: its id, labels, role and keys. */
export function dialogPopupProps(store: DialogStore, componentProps: Pick<DialogPopupProps, 'id'>) {
  return {
    get id() {
      return componentProps.id || store.floatingId;
    },
    get 'aria-labelledby'() {
      return store.titleElementId();
    },
    get 'aria-describedby'() {
      return store.descriptionElementId();
    },
    role: 'dialog',
    ...FOCUSABLE_POPUP_PROPS,
    onKeyDown: stopCompositeKeys,
  };
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
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');

  useDialogOpenChangeComplete(store);
  onClientCleanup(() => store.setPopupElement(null));

  const state: DialogPopupState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: popupTransitionStateMapping,
      props: [popupProps, dialogPopupProps(store, componentProps), elementProps],
    });

  return <DialogPopupFocus store={store}>{untrack(element)}</DialogPopupFocus>;
}
