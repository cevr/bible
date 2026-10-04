// Upstream: packages/react/src/tooltip/root/TooltipRoot.tsx
//
// Groups a tooltip's parts and owns its state. The tooltip closes on Escape,
// on a press outside it and, unless the trigger says otherwise, on a press
// on its trigger. A tooltip that becomes disabled while open closes
// (reason `disabled`); one whose trigger goes away closes too.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, onCleanup, untrack } from 'solid-js';

import { useDismiss } from '../../floating-ui-solid/hooks/useDismiss.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import {
  createTooltipStore,
  type TooltipChangeEventDetails,
  type TooltipChangeEventReason,
} from '../store/TooltipStore.ts';
import { TooltipRootContext } from './TooltipRootContext.ts';

export type { TooltipChangeEventDetails, TooltipChangeEventReason };

export interface TooltipRootState {}

export interface TooltipRootActions {
  /** Ends a close kept mounted by `preventUnmountOnClose()`. */
  unmount: () => void;
  close: () => void;
}

export interface TooltipRootProps {
  /** @default false */
  defaultOpen?: boolean | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: TooltipChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /** Receives the imperative actions. */
  actionsRef?: { current: TooltipRootActions | null } | undefined;
  /** Whether the pointer leaving the trigger closes the tooltip even on its way to the popup. @default false */
  disableHoverablePopup?: boolean | undefined;
  /** Whether the tooltip is disabled: it neither opens nor shows. @default false */
  disabled?: boolean | undefined;
  children?: JSX.Element;
}

export function TooltipRoot(props: TooltipRootProps): JSX.Element {
  const disabled = () => props.disabled ?? false;

  const store = createTooltipStore({
    openProp: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen ?? false),
    floatingId: createUniqueId(),
    disabled,
    disableHoverablePopup: () => props.disableHoverablePopup ?? false,
    onOpenChange: () => props.onOpenChange,
    onOpenChangeComplete: () => props.onOpenChangeComplete,
  });

  createEffect(
    () => store.rawOpen() && disabled(),
    (shouldClose) => {
      if (shouldClose) {
        store.setOpen(false, createChangeEventDetails(REASONS.disabled));
      }
    },
  );

  const dismiss = useDismiss(store.floatingRootContext, {
    get enabled() {
      return !disabled();
    },
    // The trigger's props apply while the tooltip is mounted (upstream renders them then only).
    referencePress: () => store.closeOnClick() && untrack(store.mounted),
  });

  if (props.actionsRef) {
    props.actionsRef.current = {
      unmount: store.forceUnmount,
      close: () => store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction)),
    };
  }
  onCleanup(() => {
    if (props.actionsRef) {
      props.actionsRef.current = null;
    }
  });

  const context: TooltipRootContext = {
    store,
    triggerProps: dismiss.reference ?? {},
    popupProps: dismiss.floating ?? {},
  };

  return <TooltipRootContext value={context}>{props.children}</TooltipRootContext>;
}
