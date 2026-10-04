// Upstream: packages/react/src/popover/root/PopoverRoot.tsx
//
// Groups a popover's parts and owns its state. The popover closes on Escape
// and on a press outside it (a press inside a nested popover is inside);
// a modal popover that traps focus closes on pointer down outside, so the
// page's hidden-from-assistive-tech marks lift at once. A popover inside
// another popover joins its tree of nested popups; any other starts one.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, onCleanup, untrack } from 'solid-js';

import {
  FloatingTree,
  FloatingTreeStore,
  useFloatingParentNodeId,
} from '../../floating-ui-solid/FloatingTree.tsx';
import { useDismiss } from '../../floating-ui-solid/hooks/useDismiss.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { mergeProps } from '../../merge-props/mergeProps.ts';
import { useOpenInteractionType } from '../../utils/useOpenInteractionType.ts';
import {
  createPopoverStore,
  type PopoverChangeEventDetails,
  type PopoverChangeEventReason,
} from '../store/PopoverStore.ts';
import { PopoverRootContext, usePopoverRootContextOptional } from './PopoverRootContext.ts';

export type { PopoverChangeEventDetails, PopoverChangeEventReason };

export interface PopoverRootState {}

export interface PopoverRootActions {
  /** Ends a close kept mounted by `preventUnmountOnClose()`. */
  unmount: () => void;
  close: () => void;
}

export interface PopoverRootProps {
  /** @default false */
  defaultOpen?: boolean | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: PopoverChangeEventDetails) => void) | undefined;
  /** Called after the open or close transition finishes. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /** Receives the imperative actions. */
  actionsRef?: { current: PopoverRootActions | null } | undefined;
  /**
   * Whether the open popover is modal.
   * - `true`: page scroll locked, outside pointer interaction blocked, and
   *   focus trapped when a `Popover.Close` is inside the popup.
   * - `false`: the rest of the page stays usable.
   * - `'trap-focus'`: focus trapped (with a `Popover.Close` inside), scroll and
   *   outside pointer interaction left alone.
   * @default false
   */
  modal?: boolean | 'trap-focus' | undefined;
  children?: JSX.Element;
}

export function PopoverRoot(props: PopoverRootProps): JSX.Element {
  const parentContext = usePopoverRootContextOptional();
  const floatingTreeRoot = parentContext?.store.floatingTreeRoot ?? new FloatingTreeStore();
  const nested = useFloatingParentNodeId() != null;

  let openRead = () => false;
  const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(() =>
    openRead(),
  );

  const modal = () => props.modal ?? false;

  const store = createPopoverStore({
    openProp: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen ?? false),
    modal,
    openMethod,
    floatingId: createUniqueId(),
    nested,
    floatingTreeRoot,
    onOpenChange: () => props.onOpenChange,
    onOpenChangeComplete: () => props.onOpenChangeComplete,
  });
  openRead = store.open;

  createEffect(store.open, (isOpen) => {
    if (!isOpen) {
      store.stickIfOpenTimeout.clear();
    }
  });
  onCleanup(() => store.stickIfOpenTimeout.clear());

  const dismiss = useDismiss(store.floatingRootContext, {
    get outsidePressEvent() {
      return {
        // A focus trap's outside marks lift on pointer down.
        mouse: modal() === 'trap-focus' ? ('sloppy' as const) : ('intentional' as const),
        touch: 'sloppy' as const,
      };
    },
    // A press inside a nested popover reaches this one only through the tree.
    externalTree: floatingTreeRoot,
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

  const context: PopoverRootContext = {
    store,
    triggerProps: mergeProps(dismiss.reference ?? {}, interactionTypeProps),
    popupProps: dismiss.floating ?? {},
  };

  const content = () => <PopoverRootContext value={context}>{props.children}</PopoverRootContext>;
  if (parentContext) {
    return content();
  }
  return <FloatingTree externalTree={floatingTreeRoot}>{content()}</FloatingTree>;
}
