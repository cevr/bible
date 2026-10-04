// Upstream: packages/react/src/tooltip/popup/TooltipPopup.tsx,
// packages/react/src/tooltip/popup/TooltipPopupDataAttributes.ts
//
// The tooltip's content container. The pointer leaving it closes the
// tooltip (after the trigger's `closeDelay`); `data-instant` says why
// transitions are skipped, if they are.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import { useHoverFloatingInteraction } from '../../floating-ui-solid/hooks/useHoverFloatingInteraction.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import type { Align, Side } from '../../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { useTooltipPositionerContext } from '../positioner/TooltipPositioner.tsx';
import { useTooltipRootContext } from '../root/TooltipRootContext.ts';
import type { TooltipInstantType } from '../store/TooltipStore.ts';

export interface TooltipPopupState {
  open: boolean;
  side: Side;
  align: Align;
  /** Why transitions are skipped, if they are. */
  instant: TooltipInstantType;
  transitionStatus: TransitionStatus;
}

export interface TooltipPopupProps extends BaseUIComponentProps<'div', TooltipPopupState> {}

export function TooltipPopup(componentProps: TooltipPopupProps): JSX.Element {
  const { store, popupProps } = useTooltipRootContext();
  const positioner = useTooltipPositionerContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

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
      return !store.disabled();
    },
    closeDelay: () => store.closeDelay(),
  });

  onCleanup(() => store.setPopupElement(null));

  const state: TooltipPopupState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get instant() {
      return store.instantType();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: (el: HTMLElement) => store.setPopupElement(el),
    stateAttributesMapping: popupTransitionStateMapping,
    props: [
      FOCUSABLE_POPUP_PROPS,
      popupProps,
      {
        get style() {
          return store.transitionStatus() === 'starting' ? { transition: 'none' } : undefined;
        },
      },
      elementProps,
    ],
  });
}
