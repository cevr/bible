// Upstream: packages/react/src/tooltip/positioner/TooltipPositioner.tsx,
// packages/react/src/tooltip/positioner/TooltipPositionerContext.ts
//
// Positions the tooltip's popup against its trigger (or `anchor`), above
// it by default. The positioner lets the pointer through while the tooltip
// is closed or when the popup is not hoverable (`disableHoverablePopup`).
import type { JSX } from '@solidjs/web';
import { createContext, omit, onCleanup, untrack, useContext } from 'solid-js';

import { POPUP_COLLISION_AVOIDANCE } from '../../internals/constants.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import {
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
  useAnchorPositioning,
} from '../../internals/useAnchorPositioning.ts';
import { usePositioner } from '../../utils/usePositioner.ts';
import { useTooltipPortalContext } from '../portal/TooltipPortal.tsx';
import { useTooltipRootContext } from '../root/TooltipRootContext.ts';
import type { TooltipInstantType } from '../store/TooltipStore.ts';

export interface TooltipPositionerContextValue {
  side: () => Side;
  align: () => Align;
  setArrowElement: (element: Element | null) => void;
  arrowUncentered: () => boolean;
  arrowStyles: () => JSX.CSSProperties;
}

const TooltipPositionerContext = createContext<TooltipPositionerContextValue | null>(null);

export function useTooltipPositionerContext(): TooltipPositionerContextValue {
  const context = useContext(TooltipPositionerContext);
  if (context === null) {
    throw new Error(
      'Base UI: TooltipPositionerContext is missing. TooltipPositioner parts must be placed within <Tooltip.Positioner>.',
    );
  }
  return context;
}

export interface TooltipPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
  /** Why transitions are skipped, if they are. */
  instant: TooltipInstantType;
}

export interface TooltipPositionerProps
  extends
    UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', TooltipPositionerState> {}

export function TooltipPositioner(componentProps: TooltipPositionerProps): JSX.Element {
  const { store } = useTooltipRootContext();
  const keepMounted = useTooltipPortalContext();
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
      return props.side ?? 'top';
    },
    get sideOffset() {
      return props.sideOffset ?? 0;
    },
    get align() {
      return props.align ?? 'center';
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
    get keepMounted() {
      return keepMounted();
    },
    get disableAnchorTracking() {
      return props.disableAnchorTracking ?? false;
    },
    get collisionAvoidance() {
      return props.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
    },
  });

  onCleanup(() => store.setPositionerElement(null));

  const state: TooltipPositionerState = {
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

  const positionerContext: TooltipPositionerContextValue = {
    side: positioner.side,
    align: positioner.align,
    setArrowElement: positioner.setArrowElement,
    arrowUncentered: positioner.arrowUncentered,
    arrowStyles: positioner.arrowStyles,
  };

  return (
    <TooltipPositionerContext value={positionerContext}>
      {/* Built inside the provider, so the popup reads it. */}
      {untrack(() =>
        usePositioner(componentProps, state, {
          styles: positioner.positionerStyles,
          transitionStatus: store.transitionStatus,
          props: elementProps,
          ref: (el: HTMLElement) => store.setPositionerElement(el),
          hidden: () => !store.mounted(),
          inert: () => !store.open() || store.disableHoverablePopup(),
        }),
      )}
    </TooltipPositionerContext>
  );
}
