// Upstream: packages/react/src/popover/popup/PopoverPopup.tsx,
// packages/react/src/utils/popups/popupStoreUtils.ts (createDefaultInitialFocus)
//
// The popover's `role="dialog"` container, labelled by `Popover.Title` and
// described by `Popover.Description`. Focus moves into it on open (its first
// tabbable element, or the popup itself when opened by touch) and back to
// the trigger on close; a hover-opened popover leaves focus alone. A modal
// popover traps focus when a `Popover.Close` is inside. Leaving a
// hover-opened popover with the pointer closes it.
import type { JSX } from '@solidjs/web';
import { createEffect, omit, untrack } from 'solid-js';

import {
  FloatingFocusManager,
  type InteractionType,
} from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { useHoverFloatingInteraction } from '../../floating-ui-solid/hooks/useHoverFloatingInteraction.ts';
import { COMPOSITE_KEYS } from '../../internals/composite/composite.ts';
import { REASONS } from '../../internals/reasons.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useToolbarRootContext } from '../../toolbar/ToolbarRootContext.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { ClosePartContext, useClosePartCount } from '../close/closePart.ts';
import { usePopoverPositionerContext } from '../positioner/PopoverPositioner.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';
import type { PopoverInstantType } from '../store/PopoverStore.ts';

type FocusTarget =
  | boolean
  | { current: HTMLElement | null }
  | ((interactionType: InteractionType) => boolean | HTMLElement | null | void);

export interface PopoverPopupState {
  open: boolean;
  side: Side;
  align: Align;
  transitionStatus: TransitionStatus;
  /** Why transitions are skipped, if they are. */
  instant: PopoverInstantType;
}

export interface PopoverPopupProps extends BaseUIComponentProps<'div', PopoverPopupState> {
  /**
   * What takes focus when the popover opens: `false` nothing, `true` the
   * default (the first tabbable element, or the popup when opened by touch),
   * an element, or a function of how it opened.
   */
  initialFocus?: FocusTarget | undefined;
  /**
   * What takes focus when the popover closes: `false` nothing, `true` the
   * default (the trigger, or what had focus before), an element, or a
   * function of how it closed.
   */
  finalFocus?: FocusTarget | undefined;
}

export function PopoverPopup(componentProps: PopoverPopupProps): JSX.Element {
  const { store, popupProps } = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const insideToolbar = useToolbarRootContext(true) != null;
  const { context: closePartContext, hasClosePart } = useClosePartCount();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'initialFocus',
    'finalFocus',
    'id',
  );

  useOpenChangeComplete({
    open: store.open,
    element: store.popupElement,
    onComplete() {
      if (untrack(store.open)) {
        store.onOpenChangeComplete(true);
      }
    },
  });

  useHoverFloatingInteraction(store.floatingRootContext, {
    get enabled() {
      return store.openOnHover() && !store.disabled();
    },
    closeDelay: () => store.closeDelay(),
  });

  const focusManagerModal = () => store.modal() !== false && hasClosePart();
  // The trigger reads it to drop its focus guards while focus is trapped.
  createEffect(focusManagerModal, (value) => {
    store.setFocusManagerModal(value);
  });

  onClientCleanup(() => {
    store.setPopupElement(null);
    store.setFocusManagerModal(false);
  });

  const initialFocus = (): FocusTarget => {
    if (componentProps.initialFocus !== undefined) {
      return componentProps.initialFocus;
    }
    return (interactionType) => (interactionType === 'touch' ? store.popupElement() : true);
  };

  const state: PopoverPopupState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
    get instant() {
      return store.instantType();
    },
  };

  // A thunk, built under the providers below so its children read them.
  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: popupTransitionStateMapping,
      props: [
        popupProps,
        FOCUSABLE_POPUP_PROPS,
        {
          get id() {
            return componentProps.id ?? store.floatingId;
          },
          role: 'dialog',
          get 'aria-labelledby'() {
            return store.titleElementId();
          },
          get 'aria-describedby'() {
            return store.descriptionElementId();
          },
          onKeyDown(event: KeyboardEvent) {
            // Arrow keys inside the popup stay there, not moving a toolbar's focus.
            if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
              event.stopPropagation();
            }
          },
          get style() {
            return store.transitionStatus() === 'starting' ? { transition: 'none' } : undefined;
          },
        },
        elementProps,
      ],
    });

  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      openInteractionType={store.openMethod()}
      modal={focusManagerModal()}
      disabled={!store.mounted() || store.openChangeReason() === REASONS.triggerHover}
      initialFocus={initialFocus()}
      returnFocus={componentProps.finalFocus}
      restoreFocus="popup"
      getInsideElements={() => [store.beforeTriggerFocusGuardRef.current]}
      previousFocusableElement={store.activeTriggerElement() as HTMLElement | null}
      nextFocusableElement={store.triggerFocusTargetRef}
      beforeContentFocusGuardRef={store.beforeContentFocusGuardRef}
      externalTree={store.floatingTreeRoot}
    >
      <ClosePartContext value={closePartContext}>{untrack(element)}</ClosePartContext>
    </FloatingFocusManager>
  );
}
