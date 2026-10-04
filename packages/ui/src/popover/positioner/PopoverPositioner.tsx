// Upstream: packages/react/src/popover/positioner/PopoverPositioner.tsx,
// packages/react/src/popover/positioner/PopoverPositionerContext.ts
//
// Positions the popover's popup against its trigger (or `anchor`). A modal
// popover (`modal={true}`) not opened by hover locks page scroll and puts a
// transparent backdrop under the popup, with a hole over the trigger so a
// press on it still toggles the popover.
import type { JSX } from '@solidjs/web';
import { createContext, omit, onCleanup, Show, untrack, useContext } from 'solid-js';

import type { FloatingContext } from '../../floating-ui-solid/FloatingRootContext.ts';
import { FloatingNode, useFloatingNodeId } from '../../floating-ui-solid/FloatingTree.tsx';
import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import {
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
  useAnchorPositioning,
} from '../../internals/useAnchorPositioning.ts';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { usePositioner } from '../../utils/usePositioner.ts';
import { useAnchoredPopupScrollLock } from '../../utils/useScrollLock.ts';
import { usePopoverPortalContext } from '../portal/PopoverPortal.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';
import type { PopoverInstantType } from '../store/PopoverStore.ts';

export interface PopoverPositionerContextValue {
  side: () => Side;
  align: () => Align;
  setArrowElement: (element: Element | null) => void;
  arrowUncentered: () => boolean;
  arrowStyles: () => JSX.CSSProperties;
  context: FloatingContext;
}

const PopoverPositionerContext = createContext<PopoverPositionerContextValue | null>(null);

export function usePopoverPositionerContext(): PopoverPositionerContextValue {
  const context = useContext(PopoverPositionerContext);
  if (context === null) {
    throw new Error(
      'Base UI: PopoverPositionerContext is missing. PopoverPositioner parts must be placed within <Popover.Positioner>.',
    );
  }
  return context;
}

export interface PopoverPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
  /** Why transitions are skipped, if they are. */
  instant: PopoverInstantType;
}

export interface PopoverPositionerProps
  extends
    UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', PopoverPositionerState> {}

export function PopoverPositioner(componentProps: PopoverPositionerProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const keepMounted = usePopoverPortalContext();
  const nodeId = useFloatingNodeId(store.floatingTreeRoot);
  const props = componentProps;
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'collisionAvoidance',
  );

  const positioner = useAnchorPositioning({
    get anchor() {
      return props.anchor;
    },
    floatingRootContext: store.floatingRootContext,
    get positionMethod() {
      return props.positionMethod ?? 'absolute';
    },
    get mounted() {
      return store.mounted();
    },
    get side() {
      return props.side;
    },
    get sideOffset() {
      return props.sideOffset ?? 0;
    },
    get align() {
      return props.align;
    },
    get alignOffset() {
      return props.alignOffset ?? 0;
    },
    get arrowPadding() {
      return props.arrowPadding ?? 5;
    },
    get collisionBoundary() {
      return props.collisionBoundary ?? 'clipping-ancestors';
    },
    get collisionPadding() {
      return props.collisionPadding ?? 5;
    },
    get sticky() {
      return props.sticky ?? false;
    },
    nodeId,
    get keepMounted() {
      return keepMounted();
    },
    get disableAnchorTracking() {
      return props.disableAnchorTracking ?? false;
    },
    get collisionAvoidance() {
      return props.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
    },
    externalTree: store.floatingTreeRoot,
  });

  // Only a fully modal popover the user did not merely hover open blocks the page.
  const trueModalNonHover = () =>
    store.modal() === true && store.openChangeReason() !== REASONS.triggerHover;

  useAnchoredPopupScrollLock(
    () => store.open() && trueModalNonHover(),
    () => store.openMethod() === 'touch',
    store.positionerElement,
    store.activeTriggerElement,
  );

  onCleanup(() => store.setPositionerElement(null));

  const state: PopoverPositionerState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get anchorHidden() {
      return positioner.anchorHidden();
    },
    get instant() {
      return store.instantType();
    },
  };

  const positionerContext: PopoverPositionerContextValue = {
    side: positioner.side,
    align: positioner.align,
    setArrowElement: positioner.setArrowElement,
    arrowUncentered: positioner.arrowUncentered,
    arrowStyles: positioner.arrowStyles,
    context: positioner.context,
  };

  return (
    <PopoverPositionerContext value={positionerContext}>
      <Show when={store.mounted() && trueModalNonHover()}>
        <InternalBackdrop
          inert={!store.open() || undefined}
          cutout={store.activeTriggerElement()}
        />
      </Show>
      <FloatingNode id={nodeId}>
        {/* Built inside the providers, so the popup reads them. */}
        {untrack(() =>
          usePositioner(componentProps, state, {
            styles: positioner.positionerStyles,
            transitionStatus: store.transitionStatus,
            props: elementProps,
            ref: (el: HTMLElement) => store.setPositionerElement(el),
            hidden: () => !store.mounted(),
            inert: () => !store.open(),
          }),
        )}
      </FloatingNode>
    </PopoverPositionerContext>
  );
}
