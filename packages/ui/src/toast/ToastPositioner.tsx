// Upstream: packages/react/src/toast/positioner/ToastPositioner.tsx,
// packages/react/src/toast/positioner/ToastPositionerContext.ts,
// packages/react/src/toast/positioner/ToastPositionerCssVars.ts,
// packages/react/src/toast/positioner/ToastPositionerDataAttributes.ts,
// packages/react/src/utils/usePositioner.tsx
//
// Positions an anchored toast against its anchor element, as a popup's
// positioner does. Each option comes from the part's own prop, else the
// toast's `positionerProps`, else the default. Renders a `<div>` element
// with the side, alignment and `--toast-index`.
import { isElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { type Accessor, createContext, createSignal, omit, useContext } from 'solid-js';

import { createFloatingRootContext } from '../floating-ui-solid/FloatingRootContext.ts';
import { DISABLED_TRANSITIONS_STYLE, POPUP_COLLISION_AVOIDANCE } from '../internals/constants.ts';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import {
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
  useAnchorPositioning,
} from '../internals/useAnchorPositioning.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { NOOP } from '../utils/dom.ts';
import { CommonPopupDataAttributes } from '../utils/popupStateMapping.ts';
import { selectors } from './store.ts';
import { useToastProviderContext, useToastSelector } from './ToastProviderContext.ts';
import { ToastRootCssVars } from './ToastRoot.tsx';
import type { ToastObject } from './types.ts';

export const ToastPositionerCssVars = {
  /** The available width between the anchor and the edge of the viewport. */
  availableWidth: '--available-width',
  /** The available height between the anchor and the edge of the viewport. */
  availableHeight: '--available-height',
  /** The anchor's width. */
  anchorWidth: '--anchor-width',
  /** The anchor's height. */
  anchorHeight: '--anchor-height',
  /** The coordinates that this element is anchored to. Used for animations and transitions. */
  transformOrigin: '--transform-origin',
} as const;

export const ToastPositionerDataAttributes = {
  /** Present when the anchor is hidden. */
  anchorHidden: CommonPopupDataAttributes.anchorHidden,
  /** Indicates which side the toast is positioned relative to the anchor. */
  side: CommonPopupDataAttributes.side,
  /** Indicates how the toast is aligned relative to the specified side. */
  align: CommonPopupDataAttributes.align,
} as const;

const ANCHOR_HIDDEN_HOOK = { [CommonPopupDataAttributes.anchorHidden]: '' };

const positionerStateMapping: StateAttributesMapping<ToastPositionerState> = {
  anchorHidden(value) {
    return value ? ANCHOR_HIDDEN_HOOK : null;
  },
};

export interface ToastPositionerContextValue {
  side: Accessor<Side>;
  align: Accessor<Align>;
  setArrowElement: (element: Element | null) => void;
  arrowUncentered: Accessor<boolean>;
  arrowStyles: Accessor<JSX.CSSProperties>;
}

export const ToastPositionerContext = createContext<ToastPositionerContextValue | null>(null);

export function useToastPositionerContext(): ToastPositionerContextValue {
  const context = useContext(ToastPositionerContext);
  if (!context) {
    throw new Error(
      'Base UI: ToastPositionerContext is missing. ToastPositioner parts must be placed within <Toast.Positioner>.',
    );
  }
  return context;
}

export interface ToastPositionerState {
  /** The side of the anchor the component is placed on. */
  side: Side;
  /** The alignment of the component relative to the anchor. */
  align: Align;
  /** Whether the anchor element is hidden. */
  anchorHidden: boolean;
}

export interface ToastPositionerProps
  extends
    BaseUIComponentProps<'div', ToastPositionerState>,
    Omit<UseAnchorPositioningSharedParameters, 'side' | 'anchor'> {
  /** An element to position the toast against. */
  anchor?: Element | null | undefined;
  /**
   * Which side of the anchor element to align the toast against.
   * May automatically change to avoid collisions.
   * @default 'top'
   */
  side?: Side | undefined;
  /** The toast object associated with the positioner. */
  toast: ToastObject;
}

export function ToastPositioner(props: ToastPositionerProps): JSX.Element {
  const context = useToastProviderContext();
  const [positionerElement, setPositionerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const fromToast = () => props.toast.positionerProps ?? {};
  const anchor = () => {
    const value = props.anchor !== undefined ? props.anchor : fromToast().anchor;
    return isElement(value) ? value : null;
  };

  const domIndex = useToastSelector(context, (state) =>
    selectors.toastIndex(state, props.toast.id),
  );
  const visibleIndex = useToastSelector(context, (state) =>
    selectors.toastVisibleIndex(state, props.toast.id),
  );

  const floatingRootContext = createFloatingRootContext({
    open: () => true,
    referenceElement: anchor,
    floatingElement: positionerElement,
    onOpenChange: NOOP,
  });

  const positioning = useAnchorPositioning({
    get anchor() {
      return anchor();
    },
    get positionMethod() {
      return props.positionMethod ?? fromToast().positionMethod ?? 'absolute';
    },
    floatingRootContext,
    mounted: true,
    get side() {
      return props.side ?? fromToast().side ?? 'top';
    },
    get sideOffset() {
      return props.sideOffset ?? fromToast().sideOffset ?? 0;
    },
    get align() {
      return props.align ?? fromToast().align ?? 'center';
    },
    get alignOffset() {
      return props.alignOffset ?? fromToast().alignOffset ?? 0;
    },
    get collisionBoundary() {
      return props.collisionBoundary ?? fromToast().collisionBoundary ?? 'clipping-ancestors';
    },
    get collisionPadding() {
      return props.collisionPadding ?? fromToast().collisionPadding ?? 5;
    },
    get sticky() {
      return props.sticky ?? fromToast().sticky ?? false;
    },
    get arrowPadding() {
      return props.arrowPadding ?? fromToast().arrowPadding ?? 5;
    },
    get disableAnchorTracking() {
      return props.disableAnchorTracking ?? fromToast().disableAnchorTracking ?? false;
    },
    keepMounted: true,
    get collisionAvoidance() {
      return (
        props.collisionAvoidance ?? fromToast().collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE
      );
    },
  });

  const state: ToastPositionerState = {
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
  };

  const positionerContext: ToastPositionerContextValue = {
    side: positioning.side,
    align: positioning.align,
    setArrowElement: positioning.setArrowElement,
    arrowUncentered: positioning.arrowUncentered,
    arrowStyles: positioning.arrowStyles,
  };

  function PositionerElement() {
    return useRenderElement('div', props, {
      ref: (element: HTMLElement) => setPositionerElement(element),
      state,
      stateAttributesMapping: positionerStateMapping,
      props: [
        {
          role: 'presentation',
          get style() {
            return {
              ...positioning.positionerStyles(),
              [ToastRootCssVars.index]: String(
                props.toast.transitionStatus === 'ending' ? domIndex() : visibleIndex(),
              ),
            };
          },
        },
        {
          get style() {
            return props.toast.transitionStatus === 'starting'
              ? DISABLED_TRANSITIONS_STYLE.style
              : undefined;
          },
        },
        omit(
          props,
          'class',
          'style',
          'render',
          'toast',
          'anchor',
          'positionMethod',
          'side',
          'sideOffset',
          'align',
          'alignOffset',
          'collisionBoundary',
          'collisionPadding',
          'sticky',
          'arrowPadding',
          'disableAnchorTracking',
          'collisionAvoidance',
        ),
      ],
    });
  }

  return (
    <ToastPositionerContext value={positionerContext}>
      <PositionerElement />
    </ToastPositionerContext>
  );
}
