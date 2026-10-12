// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (Sheet, SnapPoint, DetentPoint, useSnapPointTravel). Copyright 2026 Adobe,
// Apache-2.0 (`../LICENSE`); ported to Solid 2 and changed: the panel is a plain
// element (the dialog it holds is `Sheet.Content`); a sheet that is not modal
// leaves the page around its panel live: its container is clipped to the box
// its panel is drawn in, so only the panel takes the pointer.
//
// The swipeable panel, and the scroll container that moves it. The container
// is two viewports long along the swipe axis (three when the sheet leaves by
// either edge); a viewport-sized stage one viewport in holds the panel at its
// resting edge. Scroll snapping rests the container at the exits (the sheet
// gone) and at the stage (the sheet open), and at a 1px marker inside the
// panel for each snap point, its scroll margin a viewport so the marker rests
// at the viewport's edge with the snap point's amount of the panel showing.
//
// A sheet the user may not dismiss is clamped: the exits are not snap
// targets and the stage moves so scroll 0 rests at the first snap point (or
// 1px short of the open position, so the browser still bounces it). Its
// enter and exit run unclamped, with snapping off so the browser does not
// re-snap as the geometry changes.
//
// `swipeAnimation` names `@keyframes` (from exited to entered) the panel runs
// along the swipe; `stackAnimation` names ones it runs for each sheet opened
// in front of it, composed one onto the next.
import { isServer, type JSX } from '@solidjs/web';
import { createEffect, createSignal, For, omit, Show, untrack } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { useSheetOverlayContext } from '../overlay/SheetOverlay.tsx';
import { useSheetRootContext } from '../root/SheetRootContext.ts';
import { type SheetState, sheetStateAttributesMapping } from '../utils/sheetAttributes.ts';
import { timelineName } from '../utils/stack.ts';
import {
  type Axis,
  POSITION_ALIGNMENT,
  supportsViewTimeline,
  type SwipeAnimationRange,
  swipeAnimationStyle,
  toLength,
  viewportPadding,
} from '../utils/swipe.ts';

interface SheetPopupProps extends BaseUIComponentProps<'div', SheetState> {
  /** The `@keyframes` the panel runs while it is swiped, authored from exited to entered. */
  swipeAnimation?: string | undefined;
  /** The snap point indices the swipe animation runs between; the whole travel without. */
  swipeAnimationRange?: SwipeAnimationRange | undefined;
  /** The `@keyframes` the panel runs as each sheet in front of it opens. */
  stackAnimation?: string | undefined;
  /** Whether the panel continues a viewport past the edge it rests on, so an overscroll shows more of it. */
  overscrollPadding?: boolean | undefined;
}

/** A full-viewport snap target whose leading edge is `point` into the scroll content. */
function SnapPoint(props: { point: string; align: 'start' | 'end' | 'none'; axis: Axis }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: props.axis === 'y' ? props.point : '0',
        left: props.axis === 'x' ? props.point : '0',
        'scroll-snap-align': props.align,
        width: props.axis === 'x' ? '100dvw' : '1px',
        height: props.axis === 'y' ? '100dvh' : '1px',
      }}
    />
  );
}

/**
 * A snap marker `point` in from the panel's leading edge. It moves with the
 * panel, and its viewport-long scroll margin rests it at the viewport's edge,
 * leaving `point` of the panel showing (a percentage is of the panel's size).
 */
function DetentPoint(props: { point: string; axis: Axis; after: boolean; initial: boolean }) {
  const edge = (): JSX.CSSProperties => {
    const viewport = props.axis === 'y' ? '100dvh' : '100dvw';
    if (props.axis === 'y') {
      return props.after
        ? { top: props.point, left: '0', 'scroll-margin-top': viewport }
        : { bottom: props.point, left: '0', 'scroll-margin-bottom': viewport };
    }
    return props.after
      ? { top: '0', left: props.point, 'scroll-margin-left': viewport }
      : { top: '0', right: props.point, 'scroll-margin-right': viewport };
  };
  return (
    <div
      data-sheet-detent=""
      data-sheet-initial={props.initial ? '' : undefined}
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        'scroll-snap-align': props.after ? 'start' : 'end',
        ...edge(),
      }}
    />
  );
}

/**
 * How far the panel travels from its first snap point to all of it showing:
 * the distance from that marker to the stage's exit edge, from layout offsets
 * (which the swipe and stack transforms leave alone). Followed as the stage
 * and panel resize; 0 while `enabled` is false.
 */
function useSnapPointTravel(
  stage: () => HTMLElement | null,
  panel: () => HTMLElement | null,
  axis: () => Axis,
  after: () => boolean,
  enabled: () => boolean,
) {
  const [travel, setTravel] = createSignal(0, { ownedWrite: true });
  createEffect(
    () => [stage(), panel(), axis(), after(), enabled()] as const,
    ([stageElement, panelElement, ax, isAfter, on]) => {
      if (!on || !stageElement || !panelElement) {
        return undefined;
      }
      const measure = () => {
        const stageSize = ax === 'y' ? stageElement.clientHeight : stageElement.clientWidth;
        let max = 0;
        for (const marker of panelElement.querySelectorAll<HTMLElement>('[data-sheet-detent]')) {
          let offset = 0;
          let element: HTMLElement | null = marker;
          while (element && element !== stageElement) {
            offset += ax === 'y' ? element.offsetTop : element.offsetLeft;
            element = element.offsetParent as HTMLElement | null;
          }
          // The first snap point (the least showing) travels most.
          const size = ax === 'y' ? marker.offsetHeight : marker.offsetWidth;
          max = Math.max(max, isAfter ? stageSize - offset : offset + size);
        }
        setTravel(max);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(stageElement);
      observer.observe(panelElement);
      return () => observer.disconnect();
    },
  );
  return travel;
}

/** Whether `element` has a layout (nothing round it is `display: none`). */
const laidOut = (element: HTMLElement) => element.getClientRects().length > 0;

/**
 * The `clip-path` that leaves of `scroller` only the box `panel` is drawn in now (its
 * transforms with it), from the boxes drawn: none while either has no layout.
 */
function panelClip(scroller: HTMLElement, panel: HTMLElement): string | null {
  if (!laidOut(scroller) || !laidOut(panel)) {
    return null;
  }
  const s = scroller.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const px = (value: number) => `${Math.max(0, Math.round(value * 100) / 100)}px`;
  return `inset(${px(p.top - s.top)} ${px(s.right - p.right)} ${px(s.bottom - p.bottom)} ${px(p.left - s.left)})`;
}

/**
 * The sheet's panel, in the scroll container that swipes it.
 * Renders a `<div>` element (in two of its own).
 */
export function SheetPopup(componentProps: SheetPopupProps): JSX.Element {
  const { store } = useDialogRootContext();
  const root = useSheetRootContext();
  const sheet = useSheetOverlayContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'children',
    'swipeAnimation',
    'swipeAnimationRange',
    'stackAnimation',
    'overscrollPadding',
  );

  const owned = { ownedWrite: true } as const;
  const [scroller, setScroller] = createSignal<HTMLElement | null>(null, owned);
  const registerScroller = (element: HTMLElement) => {
    setScroller(element);
    sheet.setScroller(element);
  };
  onClientCleanup(() => sheet.setScroller(null));
  const [stage, setStage] = createSignal<HTMLElement | null>(null, owned);
  const [panel, setPanel] = createSignal<HTMLElement | null>(null, owned);

  const config = root.config;
  const viewport = () => (config().axis === 'y' ? '100dvh' : '100dvw');
  const transitioning = () => !store.open() || sheet.state.entering || sheet.state.exiting;
  const hasSnapPoints = () => !!root.snapPoints()?.length && config().before !== config().after;
  const clamped = () => root.preventDismissal() && !transitioning();
  const snapTravel = useSnapPointTravel(
    stage,
    panel,
    () => config().axis,
    () => config().after,
    () => root.preventDismissal() && hasSnapPoints(),
  );
  // At least 1px, so the container still scrolls and the browser can bounce it.
  const clampedTravel = () => `${hasSnapPoints() ? Math.max(1, snapTravel()) : 1}px`;

  const stageStart = () =>
    clamped() && config().after
      ? clampedTravel()
      : `calc(${viewport()} + ${viewportPadding(config())})`;
  const endMarker = () => {
    const { before, after } = config();
    if (clamped() && before && after) {
      return `calc(${stageStart()} + ${viewport()} + 1px)`;
    }
    if (clamped() && before) {
      return `calc(${clampedTravel()} + ${viewport()})`;
    }
    return `calc(${stageStart()} + ${viewport()}${before && after ? ` + ${viewport()}` : ''})`;
  };

  // A sheet that is not modal takes presses over its panel alone, and the page takes them
  // everywhere else. The container that scrolls takes them itself, so a finger on the panel
  // scrolls it on every engine (iOS Safari scrolls no container that takes no presses from a
  // child that does), clipped to the box the panel is drawn in. That box is read each frame
  // while the sheet is mounted, as the browser draws it, so whatever moves the panel (its swipe,
  // its owner's offsets, a resize) moves the clip in the same frame. Until it is first read
  // (the server's markup), the container takes no presses, and the panel takes its own.
  const [reach, setReach] = createSignal<string | null>(null, owned);
  createEffect(
    () => [scroller(), panel(), store.modal()] as const,
    ([scrollElement, panelElement, modal]) => {
      if (modal || !scrollElement || !panelElement) {
        setReach(null);
        return undefined;
      }
      let frame = 0;
      const look = () => {
        setReach(panelClip(scrollElement, panelElement));
        frame = requestAnimationFrame(look);
      };
      look();
      return () => cancelAnimationFrame(frame);
    },
  );

  // Moving between the clamped and unclamped geometry keeps the panel where it shows.
  let stageOffset: number | null = null;
  let wasClamped = untrack(clamped);
  createEffect(
    () => [clamped(), stageStart(), stage(), scroller()] as const,
    ([isClamped, , stageElement, scrollElement]) => {
      if (!stageElement || !scrollElement) {
        return;
      }
      const axis = untrack(config).axis;
      const offset = axis === 'y' ? stageElement.offsetTop : stageElement.offsetLeft;
      if (stageOffset != null && offset !== stageOffset && isClamped !== wasClamped) {
        const delta = offset - stageOffset;
        if (axis === 'y') {
          scrollElement.scrollTop += delta;
        } else {
          scrollElement.scrollLeft += delta;
        }
      }
      wasClamped = isClamped;
      stageOffset = offset;
    },
  );

  const panelStyle = (): JSX.CSSProperties => {
    const style: Record<string, string> = {
      // The snap markers anchor to the panel's box.
      position: 'relative',
      // It takes presses wherever it is drawn, inside an overlay that takes none (a sheet that
      // is not modal), before its container's clip is first read too.
      'pointer-events': 'auto',
      ...swipeAnimationStyle({
        name: componentProps.swipeAnimation,
        range: componentProps.swipeAnimationRange,
        snapPoints: root.snapPoints(),
        swipeDirection: root.swipeDirection(),
        index: sheet.index(),
        entering: sheet.state.entering,
        exiting: sheet.state.exiting,
      }),
    };
    const position = root.position();
    if (componentProps.overscrollPadding && position === root.swipeDirection()) {
      const length = config().axis === 'y' ? '100vh' : '100vw';
      style[`padding-${position}`] = length;
      style[`margin-${position}`] = `-${length}`;
    }
    const descendants = sheet.descendants();
    const stackAnimation = componentProps.stackAnimation;
    if (stackAnimation && descendants.length > 0 && supportsViewTimeline()) {
      // One animation per sheet in front, along that sheet's view timeline, each added onto the last.
      const first = sheet.index() + 1;
      const join = (key: string, values: string[]) => {
        style[key] = [style[key], ...values].filter(Boolean).join(', ');
      };
      join(
        'animation-name',
        descendants.map(() => stackAnimation),
      );
      join(
        'animation-timeline',
        descendants.map((_, i) => timelineName(first + i)),
      );
      join(
        'animation-direction',
        descendants.map((d) => d.direction),
      );
      join(
        'animation-iteration-count',
        descendants.map((d) => String(d.iterations)),
      );
      join(
        'animation-fill-mode',
        descendants.map(() => 'both'),
      );
      join(
        'animation-range',
        descendants.map((d) => d.range),
      );
      join(
        'animation-composition',
        descendants.map(() => 'accumulate'),
      );
      join(
        'animation-timing-function',
        descendants.map(() => 'linear'),
      );
    }
    return style;
  };

  const scrollerStyle = (): JSX.CSSProperties => {
    const { axis, containerOffset } = config();
    // A modal sheet's overlay stands on the page at its origin: the container sits at the
    // page's scroll position (locked while it is open; the origin on the server). Another's
    // overlay is fixed.
    const scrollX = store.modal() && !isServer ? untrack(() => window.scrollX) : 0;
    const scrollY = store.modal() && !isServer ? untrack(() => window.scrollY) : 0;
    const clip = reach();
    return {
      ...(clip !== null && { 'pointer-events': 'auto', 'clip-path': clip }),
      position: 'absolute',
      top: axis === 'y' ? `calc(${scrollY}px + ${containerOffset}dvh)` : `${scrollY}px`,
      left: axis === 'x' ? `calc(${scrollX}px + ${containerOffset}dvw)` : `${scrollX}px`,
      height: axis === 'y' ? '200dvh' : '100dvh',
      width: axis === 'x' ? '200dvw' : '100dvw',
      'overflow-x': axis === 'x' ? 'auto' : 'hidden',
      'overflow-y': axis === 'y' ? 'auto' : 'hidden',
      // Snapping changes only with the geometry: changed mid-swipe, Safari cancels the
      // momentum scroll without a `scrollend`, which the exit waits for.
      'scroll-snap-type': root.preventDismissal() && transitioning() ? 'none' : `${axis} mandatory`,
      'overscroll-behavior-y': axis === 'y' ? 'contain' : 'none',
      'overscroll-behavior-x': axis === 'x' ? 'contain' : 'none',
      'scrollbar-width': 'none',
      // The scroll geometry is physical: its origin and alignment stay left to right.
      direction: 'ltr',
    };
  };

  const stageStyle = (): JSX.CSSProperties => {
    const { axis } = config();
    const [x, y] = POSITION_ALIGNMENT[root.position()];
    return {
      position: 'absolute',
      top: axis === 'y' ? stageStart() : '0',
      left: axis === 'x' ? stageStart() : '0',
      height: '100dvh',
      width: '100dvw',
      display: 'flex',
      'flex-direction': axis === 'y' ? 'column' : 'row',
      'align-items': axis === 'y' ? x : y,
      'justify-content': axis === 'y' ? y : x,
    };
  };

  const children = (
    <>
      <Show when={root.snapPoints()}>
        {(points) => (
          // Inset past the overscroll padding, so a percentage is of the panel that shows.
          <div
            style={{
              position: 'absolute',
              inset: '0',
              ...(componentProps.overscrollPadding &&
                root.position() === root.swipeDirection() && {
                  [root.position()]: config().axis === 'y' ? '100vh' : '100vw',
                }),
              'pointer-events': 'none',
            }}
          >
            <For each={points()}>
              {(point, i) => (
                <DetentPoint
                  point={toLength(point)}
                  axis={config().axis}
                  after={config().after}
                  initial={i() === 0}
                />
              )}
            </For>
          </div>
        )}
      </Show>
      {componentProps.children}
    </>
  );

  const element = useRenderElement('div', componentProps, {
    state: sheet.state,
    ref: (el: HTMLElement) => setPanel(el),
    stateAttributesMapping: sheetStateAttributesMapping,
    props: [
      {
        get style() {
          return panelStyle();
        },
        children,
      },
      elementProps,
    ],
  });

  return (
    <div ref={registerScroller} data-sheet-scroll="" style={scrollerStyle()}>
      {/* The exit at scroll 0 (where a top or left sheet rests); clamped, no snap target. */}
      <SnapPoint
        point="0px"
        align={clamped() && config().after ? 'none' : 'start'}
        axis={config().axis}
      />
      {/* A sheet that leaves by either edge rests at the middle. */}
      <Show when={config().before && config().after}>
        <SnapPoint point={stageStart()} align="start" axis={config().axis} />
      </Show>
      <div ref={setStage} style={stageStyle()}>
        {element}
      </div>
      {/* The exit at the content's far end. */}
      <SnapPoint
        point={endMarker()}
        align={clamped() && config().before ? 'none' : 'end'}
        axis={config().axis}
      />
    </div>
  );
}
