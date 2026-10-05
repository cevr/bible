// Upstream: packages/react/src/internals/useAnchorPositioning.ts,
// packages/react/src/floating-ui-react/hooks/useFloating.ts
//
// Positions a popup against its anchor (the trigger, or `anchor`) with
// Floating UI: a side and alignment with offsets, collision avoidance (flip
// to the other side, shift along the edge), and the CSS variables the
// popup's styles read (`--available-width/height`, `--anchor-width/height`,
// `--transform-origin`). It re-positions while the anchor scrolls or
// resizes. Until the first position is computed the popup is invisible and
// fixed at 0,0, so focusing into it cannot scroll the page.
import {
  autoUpdate,
  computePosition,
  flip,
  limitShift,
  type Middleware,
  type MiddlewareData,
  type MiddlewareState,
  offset,
  type Padding,
  type Placement,
  type Rect,
  shift as floatingShift,
  size,
  type VirtualElement,
} from '@floating-ui/dom';
import { getAlignment, getSide, getSideAxis } from '@floating-ui/utils';
import type { JSX } from '@solidjs/web';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';

import { useDirectionAccessor } from './DirectionContext.ts';
import type {
  FloatingContext,
  FloatingRootContext,
} from '../floating-ui-solid/FloatingRootContext.ts';
import {
  type FloatingTreeStore,
  setFloatingNodeContext,
  useFloatingTree,
} from '../floating-ui-solid/FloatingTree.tsx';
import { arrow, hide } from '../floating-ui-solid/middleware.ts';
import { ownerDocument, ownerWindow } from '../utils/dom.ts';
import { CommonPositionerCssVars } from '../utils/popupStateMapping.ts';

type PhysicalSide = 'top' | 'right' | 'bottom' | 'left';
export type Side = PhysicalSide | 'inline-end' | 'inline-start';
export type Align = 'start' | 'center' | 'end';
export type Boundary = 'clipping-ancestors' | Element | Element[] | Rect;
export type OffsetFunction = (data: {
  side: Side;
  align: Align;
  anchor: { width: number; height: number };
  positioner: { width: number; height: number };
}) => number;

export interface CollisionAvoidance {
  /** `flip` to the other side, `shift` along it, or `none`. */
  side?: 'flip' | 'shift' | 'none' | undefined;
  /** `flip` start and end, `shift` to fit, or `none`. */
  align?: 'flip' | 'shift' | 'none' | undefined;
  /** When neither side of the axis fits: the perpendicular side to try first, or `none`. */
  fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

export type AnchorValue =
  | Element
  | VirtualElement
  | null
  | { current: Element | null }
  | (() => Element | VirtualElement | null)
  | undefined;

export interface UseAnchorPositioningSharedParameters {
  /** What the popup is positioned against; the trigger when not given. */
  anchor?: AnchorValue;
  positionMethod?: 'absolute' | 'fixed' | undefined;
  side?: Side | undefined;
  sideOffset?: number | OffsetFunction | undefined;
  align?: Align | undefined;
  alignOffset?: number | OffsetFunction | undefined;
  collisionBoundary?: Boundary | undefined;
  collisionPadding?: Padding | undefined;
  /** Whether the popup stays in view after its anchor scrolls out. */
  sticky?: boolean | undefined;
  disableAnchorTracking?: boolean | undefined;
  collisionAvoidance?: CollisionAvoidance | undefined;
}

export interface UseAnchorPositioningParameters extends UseAnchorPositioningSharedParameters {
  floatingRootContext: FloatingRootContext;
  mounted: boolean;
  nodeId?: string | undefined;
  shift?:
    | { crossAxis?: boolean | undefined; rootBoundary?: 'layoutViewport' | undefined }
    | undefined;
  externalTree?: FloatingTreeStore | undefined;
}

export interface UseAnchorPositioningReturnValue {
  positionerStyles: Accessor<JSX.CSSProperties>;
  side: Accessor<Side>;
  align: Accessor<Align>;
  physicalSide: Accessor<PhysicalSide>;
  anchorHidden: Accessor<boolean>;
  isPositioned: Accessor<boolean>;
  context: FloatingContext;
  update: () => void;
}

function getLogicalSide(sideParam: Side, renderedSide: PhysicalSide, isRtl: boolean): Side {
  const isLogicalSideParam = sideParam === 'inline-start' || sideParam === 'inline-end';
  const logicalRight = isRtl ? 'inline-start' : 'inline-end';
  const logicalLeft = isRtl ? 'inline-end' : 'inline-start';
  return {
    top: 'top',
    right: isLogicalSideParam ? logicalRight : 'right',
    bottom: 'bottom',
    left: isLogicalSideParam ? logicalLeft : 'left',
  }[renderedSide] as Side;
}

function getOffsetData(state: MiddlewareState, sideParam: Side, isRtl: boolean) {
  const { rects, placement } = state;
  return {
    side: getLogicalSide(sideParam, getSide(placement), isRtl),
    align: getAlignment(placement) || 'center',
    anchor: { width: rects.reference.width, height: rects.reference.height },
    positioner: { width: rects.floating.width, height: rects.floating.height },
  } as const;
}

function resolveAnchor(anchor: AnchorValue): Element | VirtualElement | null {
  const value = typeof anchor === 'function' ? anchor() : anchor;
  if (value != null && 'current' in value) {
    return value.current;
  }
  return value ?? null;
}

function roundByDPR(element: Element, value: number) {
  const dpr = ownerWindow(element).devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
}

export function useAnchorPositioning(
  params: UseAnchorPositioningParameters,
): UseAnchorPositioningReturnValue {
  const rootContext = params.floatingRootContext;
  const direction = useDirectionAccessor();
  const tree = useFloatingTree(params.externalTree);

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

  const sideParam = () => params.side ?? 'bottom';
  const isRtl = () => direction() === 'rtl';

  const side = createMemo<PhysicalSide>(() => {
    const rtl = isRtl();
    return {
      top: 'top',
      right: 'right',
      bottom: 'bottom',
      left: 'left',
      'inline-end': rtl ? 'left' : 'right',
      'inline-start': rtl ? 'right' : 'left',
    }[sideParam()] as PhysicalSide;
  });
  const placementAlign = (): Align => params.align ?? 'center';
  const placement = createMemo<Placement>(() =>
    placementAlign() === 'center' ? side() : (`${side()}-${placementAlign()}` as Placement),
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
    const avoidance = params.collisionAvoidance ?? {};
    const collisionAvoidanceSide = avoidance.side || 'flip';
    const collisionAvoidanceAlign = avoidance.align || 'flip';
    const fallbackAxisSide = avoidance.fallbackAxisSide || 'end';
    const shiftCrossAxis = params.shift?.crossAxis ?? false;
    const sticky = params.sticky ?? false;
    const currentSideParam = sideParam();
    const rtl = isRtl();
    const sideOffset = params.sideOffset ?? 0;
    const alignOffset = params.alignOffset ?? 0;
    const paddingParam = params.collisionPadding ?? 5;
    const collisionPadding =
      typeof paddingParam === 'number'
        ? { top: paddingParam, right: paddingParam, bottom: paddingParam, left: paddingParam }
        : {
            top: paddingParam.top || 0,
            right: paddingParam.right || 0,
            bottom: paddingParam.bottom || 0,
            left: paddingParam.left || 0,
          };
    // A bias to the preferred side, in `flip()` only: on iOS a centered input
    // with the keyboard open would otherwise flip to the top.
    const bias = 1;
    const biasTop = currentSideParam === 'bottom' ? bias : 0;
    const biasBottom = currentSideParam === 'top' ? bias : 0;
    const biasLeft = currentSideParam === 'right' ? bias : 0;
    const biasRight = currentSideParam === 'left' ? bias : 0;
    const boundary =
      params.collisionBoundary === 'clipping-ancestors' || params.collisionBoundary == null
        ? 'clippingAncestors'
        : params.collisionBoundary;
    const common = { boundary, padding: collisionPadding } as const;

    const middleware: Array<Middleware | null | undefined> = [];
    middleware.push(
      offset((state) => {
        const data = getOffsetData(state, currentSideParam, rtl);
        const sideAxis = typeof sideOffset === 'function' ? sideOffset(data) : sideOffset;
        const alignAxis = typeof alignOffset === 'function' ? alignOffset(data) : alignOffset;
        return { mainAxis: sideAxis, crossAxis: alignAxis, alignmentAxis: alignAxis };
      }),
    );

    const shiftDisabled = collisionAvoidanceAlign === 'none' && collisionAvoidanceSide !== 'shift';
    const crossAxisShiftEnabled =
      !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === 'shift');

    const flipMiddleware =
      collisionAvoidanceSide === 'none'
        ? null
        : flip({
            ...common,
            // A larger padding than size()'s, so a popup capped by --available-height still flips.
            padding: {
              top: collisionPadding.top + bias + biasTop,
              right: collisionPadding.right + bias + biasRight,
              bottom: collisionPadding.bottom + bias + biasBottom,
              left: collisionPadding.left + bias + biasLeft,
            },
            mainAxis: !shiftCrossAxis && collisionAvoidanceSide === 'flip',
            crossAxis: collisionAvoidanceAlign === 'flip' ? 'alignment' : false,
            fallbackAxisSideDirection: fallbackAxisSide,
          });
    const shiftMiddleware = shiftDisabled
      ? null
      : floatingShift({
          ...common,
          rootBoundary: params.shift?.rootBoundary === 'layoutViewport' ? 'viewport' : undefined,
          mainAxis: collisionAvoidanceAlign !== 'none',
          crossAxis: crossAxisShiftEnabled,
          limiter: sticky || shiftCrossAxis ? undefined : limitShift(),
        });

    // https://floating-ui.com/docs/flip#combining-with-shift
    if (
      collisionAvoidanceSide === 'shift' ||
      collisionAvoidanceAlign === 'shift' ||
      untrack(placementAlign) === 'center'
    ) {
      middleware.push(shiftMiddleware, flipMiddleware);
    } else {
      middleware.push(flipMiddleware, shiftMiddleware);
    }

    middleware.push(
      size({
        ...common,
        apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
          if (!untrack(() => params.mounted)) {
            return;
          }
          const floatingStyle = floating.style;
          floatingStyle.setProperty(CommonPositionerCssVars.availableWidth, `${availableWidth}px`);
          floatingStyle.setProperty(
            CommonPositionerCssVars.availableHeight,
            `${availableHeight}px`,
          );
          // Snapped to device pixels, so a popup sized to the anchor matches it visually.
          const dpr = ownerWindow(floating).devicePixelRatio || 1;
          const { x: rx, y: ry, width, height } = rects.reference;
          const anchorWidth = (Math.round((rx + width) * dpr) - Math.round(rx * dpr)) / dpr;
          const anchorHeight = (Math.round((ry + height) * dpr) - Math.round(ry * dpr)) / dpr;
          floatingStyle.setProperty(CommonPositionerCssVars.anchorWidth, `${anchorWidth}px`);
          floatingStyle.setProperty(CommonPositionerCssVars.anchorHeight, `${anchorHeight}px`);
        },
      }),
      // The transform origin is computed from an arrow; no popup draws one, so a stand-in.
      arrow((state) => ({
        element: ownerDocument(state.elements.floating).createElement('div'),
        padding: 0,
      })),
      {
        name: 'transformOrigin',
        fn(state) {
          const {
            elements: { floating },
            middlewareData: data,
            placement: rendered,
            platform,
            rects,
            y: stateY,
          } = state;
          const renderedSide = getSide(rendered);
          const renderedAlign = getAlignment(rendered);
          const isVertical = getSideAxis(renderedSide) === 'y';
          const sideOffsetValue =
            typeof sideOffset === 'function'
              ? sideOffset(getOffsetData(state, currentSideParam, rtl))
              : sideOffset;
          // An aligned popup grows from its aligned edge until a shift breaks the
          // alignment; everything else grows from the stand-in arrow's point.
          let crossOrigin: string;
          if (
            renderedAlign &&
            Math.abs(isVertical ? data.shift?.x || 0 : data.shift?.y || 0) <= 1
          ) {
            const platformRtl = (platform.isRTL as ((el: Element) => boolean) | undefined)?.(
              floating,
            );
            crossOrigin =
              (renderedAlign === 'start') === (isVertical && platformRtl === true) ? '100%' : '0%';
          } else {
            crossOrigin = `${isVertical ? data.arrow?.x || 0 : data.arrow?.y || 0}px`;
          }
          // The anchor-facing edge, or the anchor's center when the popup overlaps it.
          let sideOrigin =
            renderedSide === 'top' || renderedSide === 'left'
              ? `calc(100% + ${sideOffsetValue}px)`
              : `${-sideOffsetValue}px`;
          if (
            crossAxisShiftEnabled &&
            isVertical &&
            Math.abs(data.shift?.y || 0) > sideOffsetValue
          ) {
            sideOrigin = `${rects.reference.y + rects.reference.height / 2 - stateY}px`;
          }
          floating.style.setProperty(
            CommonPositionerCssVars.transformOrigin,
            isVertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`,
          );
          return {};
        },
      },
      hide,
    );
    return middleware.filter((m): m is Middleware => m != null);
  };

  let generation = 0;
  const update = () => {
    const reference = untrack(rootContext.referenceElement);
    const floating = untrack(rootContext.floatingElement);
    if (!reference || !floating || !untrack(() => params.mounted)) {
      return;
    }
    const current = ++generation;
    const positionMethod = params.positionMethod ?? 'absolute';
    computePosition(reference, floating, {
      placement: untrack(placement),
      strategy: positionMethod,
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
    () => (params.mounted ? resolveAnchor(params.anchor) : undefined),
    (anchor) => {
      if (anchor !== undefined && anchor !== null) {
        rootContext.setPositionReference(anchor);
      } else if (anchor === null) {
        rootContext.setPositionReference(null);
      }
    },
  );

  // Positions while mounted, re-running as the anchor moves or resizes.
  createEffect(
    () =>
      [
        params.mounted,
        rootContext.referenceElement(),
        rootContext.floatingElement(),
        params.disableAnchorTracking ?? false,
      ] as const,
    ([mounted, reference, floating, disableTracking]) => {
      if (!mounted || !reference || !floating) {
        return undefined;
      }
      return autoUpdate(reference, floating, update, {
        ancestorScroll: !disableTracking,
        elementResize: !disableTracking && typeof ResizeObserver !== 'undefined',
        layoutShift: !disableTracking && typeof IntersectionObserver !== 'undefined',
      });
    },
  );

  // A changed option re-positions.
  createEffect(
    () => [
      placement(),
      params.positionMethod,
      params.sideOffset,
      params.alignOffset,
      params.collisionBoundary,
      params.collisionPadding,
      params.sticky,
      params.collisionAvoidance,
      isRtl(),
    ],
    () => update(),
  );

  const renderedSide = () => getSide(renderedPlacement());
  const renderedAlign = () => (getAlignment(renderedPlacement()) || 'center') as Align;

  const positionerStyles = createMemo<JSX.CSSProperties>(() => {
    const positioned = isPositioned();
    const method = params.positionMethod ?? 'absolute';
    // Fixed until positioned, so focusing into the popup cannot scroll the page.
    const position = positioned ? strategy() || method : 'fixed';
    const base: Record<string, string | number | undefined> = {};
    if (!positioned) {
      base['position'] = position;
      base['top'] = '0px';
      base['left'] = '0px';
    } else {
      const floating = untrack(rootContext.floatingElement);
      const rx = floating ? roundByDPR(floating, x()) : x();
      const ry = floating ? roundByDPR(floating, y()) : y();
      base['position'] = position;
      base['left'] = '0px';
      base['top'] = '0px';
      base['transform'] = `translate(${rx}px, ${ry}px)`;
      if (floating && (ownerWindow(floating).devicePixelRatio || 1) >= 1.5) {
        base['will-change'] = 'transform';
      }
    }
    // Seeded so `max-height: var(--available-height)` resolves before size() writes the real value.
    base[CommonPositionerCssVars.availableWidth] = '100vw';
    base[CommonPositionerCssVars.availableHeight] = '100vh';
    if (!positioned) {
      base['opacity'] = '0';
    }
    return base as JSX.CSSProperties;
  });

  // What the floating tree reads of this popup.
  const context: FloatingContext = {
    get open() {
      return untrack(rootContext.open);
    },
    get nodeId() {
      return params.nodeId;
    },
    get placement() {
      return untrack(renderedPlacement);
    },
    elements: {
      get floating() {
        return untrack(rootContext.floatingElement);
      },
      get domReference() {
        return untrack(rootContext.domReferenceElement);
      },
    },
    dataRef: rootContext.dataRef,
  };
  rootContext.dataRef.current.floatingContext = context;
  createEffect(
    () => params.nodeId,
    (nodeId) => setFloatingNodeContext(tree, nodeId, context),
  );

  return {
    positionerStyles,
    side: () => getLogicalSide(sideParam(), renderedSide(), isRtl()),
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden: () => Boolean(middlewareData().hide?.referenceHidden),
    isPositioned,
    context,
    update,
  };
}
