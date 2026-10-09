// Upstream: packages/react/src/internals/useAnchorPositioning.ts,
// packages/react/src/floating-ui-react/hooks/useFloating.ts,
// packages/react/src/floating-ui-react/middleware/arrow.ts (the centre the origin reads)
//
// Positions a menu's popup under its anchor (the trigger, or a context menu's
// point) with Floating UI: an alignment with offsets, the dropdown's
// collision avoidance (flip to the top, or to the other alignment, and shift
// along the edge; never to a left or right side). Upstream's `--available-*`,
// `--anchor-*` and `--transform-origin` variables are left out: no stylesheet
// reads them. It re-positions while the anchor scrolls or resizes. Until the first position is computed the popup is invisible and
// fixed at 0,0, so focusing into it cannot scroll the page.
import {
  autoUpdate,
  computePosition,
  flip,
  limitShift,
  type Middleware,
  type MiddlewareData,
  offset,
  type Placement,
  shift as floatingShift,
  type VirtualElement,
} from '@floating-ui/dom';
import { getAlignment, getSide } from '@floating-ui/utils';
import type { JSX } from '@solidjs/web';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';

import type { FloatingRootContext } from '../floating-ui-solid/FloatingRootContext.ts';
import { hide } from '../floating-ui-solid/middleware.ts';
import { ownerWindow } from '../utils/dom.ts';

/** The side the popup renders on: under its anchor, or over it after a flip. */
export type Side = 'top' | 'bottom';
export type Align = 'start' | 'center' | 'end';

/** The space kept between the popup and the edges it must stay inside. */
const COLLISION_PADDING = 5;

interface UseAnchorPositioningParameters {
  floatingRootContext: FloatingRootContext;
  mounted: boolean;
  /** What the popup is positioned against in place of the trigger. */
  anchor: VirtualElement | undefined;
  positionMethod: 'absolute' | 'fixed';
  sideOffset: number;
  align: Align;
  alignOffset: number;
  /**
   * Whether a shift may move the popup over its anchor, within the viewport,
   * rather than flipping it (a context menu kept on screen at the pointer).
   */
  shiftCrossAxis: boolean;
}

interface UseAnchorPositioningReturnValue {
  positionerStyles: Accessor<JSX.CSSProperties>;
  side: Accessor<Side>;
  align: Accessor<Align>;
  anchorHidden: Accessor<boolean>;
}

function roundByDPR(element: Element, value: number) {
  const dpr = ownerWindow(element).devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
}

export function useAnchorPositioning(
  params: UseAnchorPositioningParameters,
): UseAnchorPositioningReturnValue {
  const rootContext = params.floatingRootContext;

  const [x, setX] = createSignal(0, { ownedWrite: true });
  const [y, setY] = createSignal(0, { ownedWrite: true });
  const [renderedPlacement, setRenderedPlacement] = createSignal<Placement>('bottom', {
    ownedWrite: true,
  });
  const [middlewareData, setMiddlewareData] = createSignal<MiddlewareData>(
    {},
    {
      ownedWrite: true,
    },
  );
  const [isPositioned, setIsPositioned] = createSignal(false, { ownedWrite: true });
  const [strategy, setStrategy] = createSignal<'absolute' | 'fixed'>('absolute', {
    ownedWrite: true,
  });

  const placement = createMemo<Placement>(() =>
    params.align === 'center' ? 'bottom' : (`bottom-${params.align}` as Placement),
  );

  createEffect(
    () => params.mounted,
    (mounted) => {
      if (!mounted) {
        setIsPositioned(false);
      }
    },
  );

  const buildMiddleware = (): Middleware[] => {
    const shiftCrossAxis = params.shiftCrossAxis;
    const sideOffset = params.sideOffset;
    const alignOffset = params.alignOffset;
    const common = { boundary: 'clippingAncestors', padding: COLLISION_PADDING } as const;

    // One pixel more than the collision padding, and one more on top as a bias to
    // the bottom: on iOS a centered input with the keyboard open would otherwise
    // flip to the top.
    const flipPadding = COLLISION_PADDING + 1;
    const flipMiddleware = flip({
      ...common,
      padding: { top: flipPadding + 1, right: flipPadding, bottom: flipPadding, left: flipPadding },
      mainAxis: !shiftCrossAxis,
      crossAxis: 'alignment',
      fallbackAxisSideDirection: 'none',
    });
    const shiftMiddleware = floatingShift({
      ...common,
      rootBoundary: shiftCrossAxis ? 'viewport' : undefined,
      mainAxis: true,
      crossAxis: shiftCrossAxis,
      limiter: shiftCrossAxis ? undefined : limitShift(),
    });

    // https://floating-ui.com/docs/flip#combining-with-shift
    const avoidance =
      untrack(() => params.align) === 'center'
        ? [shiftMiddleware, flipMiddleware]
        : [flipMiddleware, shiftMiddleware];

    return [
      offset({ mainAxis: sideOffset, crossAxis: alignOffset, alignmentAxis: alignOffset }),
      ...avoidance,
      hide,
    ];
  };

  let generation = 0;
  const update = () => {
    const reference = untrack(rootContext.referenceElement);
    const floating = untrack(rootContext.floatingElement);
    if (!reference || !floating || !untrack(() => params.mounted)) {
      return;
    }
    const current = ++generation;
    computePosition(reference, floating, {
      placement: untrack(placement),
      strategy: untrack(() => params.positionMethod),
      middleware: buildMiddleware(),
    }).then((data) => {
      if (current !== generation || !untrack(() => params.mounted)) {
        return;
      }
      setX(data.x);
      setY(data.y);
      setRenderedPlacement(data.placement);
      setStrategy(data.strategy);
      setMiddlewareData(() => data.middlewareData);
      setIsPositioned(true);
    });
  };

  // The anchor, when given, replaces the trigger as what the popup is positioned against.
  createEffect(
    () => (params.mounted ? params.anchor : undefined),
    (anchor) => {
      if (anchor !== undefined) {
        rootContext.setPositionReference(anchor);
      }
    },
  );

  // Positions while mounted, re-running as the anchor moves or resizes.
  createEffect(
    () => [params.mounted, rootContext.referenceElement(), rootContext.floatingElement()] as const,
    ([mounted, reference, floating]) => {
      if (!mounted || !reference || !floating) {
        return undefined;
      }
      return autoUpdate(reference, floating, update);
    },
  );

  // A changed option re-positions.
  createEffect(
    () => [placement(), params.positionMethod, params.sideOffset, params.alignOffset],
    () => update(),
  );

  const positionerStyles = createMemo<JSX.CSSProperties>(() => {
    const positioned = isPositioned();
    // Fixed until positioned, so focusing into the popup cannot scroll the page.
    const base: Record<string, string | number | undefined> = {
      position: positioned ? strategy() : 'fixed',
      top: '0px',
      left: '0px',
    };
    if (positioned) {
      const floating = untrack(rootContext.floatingElement);
      const rx = floating ? roundByDPR(floating, x()) : x();
      const ry = floating ? roundByDPR(floating, y()) : y();
      base['transform'] = `translate(${rx}px, ${ry}px)`;
      if (floating && (ownerWindow(floating).devicePixelRatio || 1) >= 1.5) {
        base['will-change'] = 'transform';
      }
    } else {
      base['opacity'] = '0';
    }
    return base as JSX.CSSProperties;
  });

  return {
    positionerStyles,
    side: () => getSide(renderedPlacement()) as Side,
    align: () => (getAlignment(renderedPlacement()) || 'center') as Align,
    anchorHidden: () => Boolean(middlewareData().hide?.referenceHidden),
  };
}
