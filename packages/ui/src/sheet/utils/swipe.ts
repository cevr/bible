// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (getSwipeConfig, POSITION_ALIGNMENT, toLength, viewportPadding, useSwipeAnimation,
// scrollAlongAxis, scrollDetentIntoView as detentScroll, calcToPx). Copyright 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2 and changed as the comments below say.
//
// The sheet's geometry. The sheet lives inside an oversized scroll container:
// scrolling slides a viewport-sized stage (which holds the sheet) on and off
// screen along the swipe axis, so the browser drives the swipe natively (its
// momentum, its overscroll), with no touch handling of ours. The container is
// two viewports along the axis for a sheet that leaves by one edge (three for
// one that leaves by both); the stage sits one viewport in, and snap markers
// at the content's extremes are the entered and exited resting positions.

/** The edge a sheet rests on. */
export type SheetPosition = 'bottom' | 'top' | 'left' | 'right' | 'center';

/** The way a swipe dismisses a sheet: toward one edge, or either edge of an axis. */
export type SheetSwipeDirection = 'bottom' | 'top' | 'vertical' | 'left' | 'right' | 'horizontal';

export type Axis = 'x' | 'y';

/** A snap point: the amount of the sheet left showing, in pixels (a number) or a CSS length. */
export type SnapPoint = number | string;

export interface SwipeConfig {
  /** `y` for top, bottom and vertical; `x` for left, right and horizontal. */
  readonly axis: Axis;
  /** Whether the sheet may be swiped off the start edge (top or left). */
  readonly before: boolean;
  /** Whether the sheet may be swiped off the end edge (bottom or right). */
  readonly after: boolean;
  /** The distance between the two extreme scroll positions, in viewport percent. */
  readonly maxScroll: number;
  /** The scroll position at which the sheet is fully entered, in viewport percent. */
  readonly enteredScroll: number;
  /** The scroll container's offset along the axis, in viewport percent. */
  readonly containerOffset: number;
  /** The view timeline's range for the swipe animations. */
  readonly viewRange: 'cover' | 'exit' | 'entry';
  readonly viewDirection: 'normal' | 'reverse' | 'alternate';
  readonly viewIterations: number;
}

/** The swipe direction a position takes when its owner names none. */
export function defaultSwipeDirection(position: SheetPosition): SheetSwipeDirection {
  return position === 'center' ? 'vertical' : position;
}

/**
 * The geometry of a swipe direction. A sheet that leaves only by the start
 * edge (top, left) rests at scroll 0 and is swiped toward the end to dismiss;
 * any other rests one viewport in. The swipe animations map onto the one
 * viewport edge the sheet crosses: `entry` is the scrollport's end edge
 * (where it appears from), `exit` its start edge (reversed, so progress 0 is
 * always exited and 1 entered). A sheet that leaves by both edges runs the
 * same keyframes over the whole `cover` range twice, alternating.
 */
export function getSwipeConfig(swipeDirection: SheetSwipeDirection): SwipeConfig {
  const axis: Axis =
    swipeDirection === 'top' || swipeDirection === 'bottom' || swipeDirection === 'vertical'
      ? 'y'
      : 'x';
  const before =
    swipeDirection === 'top' ||
    swipeDirection === 'left' ||
    swipeDirection === 'vertical' ||
    swipeDirection === 'horizontal';
  const after =
    swipeDirection === 'bottom' ||
    swipeDirection === 'right' ||
    swipeDirection === 'vertical' ||
    swipeDirection === 'horizontal';
  const both = before && after;
  return {
    axis,
    before,
    after,
    // Each edge it can leave by adds a viewport of travel.
    maxScroll: (Number(before) + Number(after)) * 100,
    enteredScroll: before && !after ? 0 : 100,
    containerOffset: before && !after ? -100 : 0,
    viewRange: both ? 'cover' : before ? 'exit' : 'entry',
    viewDirection: both ? 'alternate' : before ? 'reverse' : 'normal',
    viewIterations: both ? 2 : 1,
  };
}

/** The stage's flex alignment, [x, y], for each resting position. */
export const POSITION_ALIGNMENT: Record<SheetPosition, readonly [string, string]> = {
  top: ['center', 'flex-start'],
  bottom: ['center', 'flex-end'],
  left: ['flex-start', 'center'],
  right: ['flex-end', 'center'],
  center: ['center', 'center'],
};

/** A snap point as a CSS length: a number is pixels. */
export function toLength(point: SnapPoint): string {
  return typeof point === 'number' ? `${point}px` : point;
}

const isIOSSafari = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const agent = navigator.userAgent;
  const ios =
    /^i(os$|p)/i.test(navigator.platform ?? '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(agent) && !/Chrome|CriOS|FxiOS/.test(agent);
};

// iOS Safari shows more than `100lvh` behind its toolbar even when the toolbar is
// collapsed: a bottom sheet is pushed down by this much so it can scroll out from
// behind it, and is not counted gone until it has.
const VIEWPORT_PADDING = isIOSSafari() ? 'calc(100lvh - 100svh + 58px)' : '0px';

/** The extra travel past the end edge along `axis` (iOS Safari's toolbar), as CSS. */
export function viewportPadding(config: SwipeConfig): string {
  return config.after && config.axis === 'y' ? VIEWPORT_PADDING : '0px';
}

/** The last `calc()` measured, and the window size it was measured in. */
let measured: { readonly key: string; readonly px: number } | null = null;

/**
 * A CSS length of pixels and viewport units (a `calc()` of them too) in pixels, measured in the
 * document. A `calc()` is measured once for each window size (its viewport units change with the
 * window alone): the sheet reads it each frame.
 */
export function cssToPx(length: string): number {
  if (!length.startsWith('calc(')) {
    return parseFloat(length) || 0;
  }
  const key = `${length} ${window.innerWidth}x${window.innerHeight}`;
  if (measured?.key === key) {
    return measured.px;
  }
  const measure = document.createElement('div');
  measure.inert = true;
  Object.assign(measure.style, {
    position: 'absolute',
    top: '0px',
    left: '0px',
    contain: 'strict',
    height: length,
  });
  document.body.appendChild(measure);
  const height = parseFloat(getComputedStyle(measure).height) || 0;
  measure.remove();
  measured = { key, px: height };
  return height;
}

/** The scroll travel of one viewport along the sheet's axis, in pixels. */
export function viewportTravel(config: SwipeConfig): number {
  return config.axis === 'y'
    ? window.innerHeight + cssToPx(viewportPadding(config))
    : window.innerWidth;
}

/** Whether this browser runs scroll-driven animations (`animation-timeline: view()`). */
export const supportsViewTimeline = (): boolean =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: view()');

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scrolls `element` to `value` along `axis`, smoothly when asked and motion is not reduced. */
export function scrollAlongAxis(element: HTMLElement, axis: Axis, value: number, smooth = false) {
  const behavior: ScrollBehavior = smooth && !reduceMotion() ? 'smooth' : 'instant';
  element.scrollTo(axis === 'y' ? { top: value, behavior } : { left: value, behavior });
}

/**
 * The scroll position along `axis` at which `scroller` rests `marker` where its scroll margin
 * snaps it (`align`, its snap alignment). Upstream's `scrollDetentIntoView` reads it from the
 * boxes drawn; this reads the layout (the offsets down to the container's content, each
 * ancestor's border with them), which the swipe and stack animations' transforms leave alone,
 * so it is where the sheet rests whatever the panel's animation draws now.
 */
function detentScroll(
  scroller: HTMLElement,
  marker: HTMLElement,
  axis: Axis,
  align: 'start' | 'end',
): number {
  let offset = 0;
  for (let element: HTMLElement | null = marker; element && element !== scroller;) {
    offset += axis === 'y' ? element.offsetTop : element.offsetLeft;
    const parent = element.offsetParent as HTMLElement | null;
    if (parent && parent !== scroller) {
      offset += axis === 'y' ? parent.clientTop : parent.clientLeft;
    }
    element = parent;
  }
  const style = getComputedStyle(marker);
  if (axis === 'y') {
    return align === 'start'
      ? offset - parseFloat(style.scrollMarginTop)
      : offset + marker.offsetHeight + parseFloat(style.scrollMarginBottom) - scroller.clientHeight;
  }
  return align === 'start'
    ? offset - parseFloat(style.scrollMarginLeft)
    : offset + marker.offsetWidth + parseFloat(style.scrollMarginRight) - scroller.clientWidth;
}

/** Where a sheet rests: a scroll position along its axis (`restAt`). */
export interface Rest {
  readonly axis: Axis;
  readonly target: number;
}

/**
 * Where the sheet in `scroller` rests open for the layout it has now and its swipe direction: the
 * scroll position along its axis that rests its first snap point's marker, or, without one, all
 * of it showing (the entered share of the travel, which counts the edges it leaves by and its
 * container's offset). Read from the layout, not from the boxes drawn: a swipe or stack
 * animation's transforms do not move it. The one answer the entrance aims at, checks each frame
 * and arrives at, the one a sheet at rest is put back at, and the one its container's clip
 * counts from.
 */
export function restAt(scroller: HTMLElement, config: SwipeConfig): Rest {
  // Its own marker comes first: a sheet nested in its content renders after it.
  const initial = scroller.querySelector<HTMLElement>('[data-sheet-initial]');
  const target = initial
    ? detentScroll(scroller, initial, config.axis, config.after ? 'start' : 'end')
    : (config.enteredScroll / 100) * viewportTravel(config);
  return { axis: config.axis, target };
}

const SETTLE_QUIET_MS = 150;
/**
 * How long, in frames and in time (both), a scroll that has moved stands still
 * before it has stopped elsewhere: on a loaded page the browser's own smooth
 * scroll can stand still for some frames on its way.
 */
const STILL_FRAMES = 5;
const STILL_MS = 300;
/** Frames a scroll sent somewhere may take to move at all before it is taken as going nowhere. */
const START_FRAMES = 60;

/** Whether `scroller` stands at `target` along `axis`, as far as it can scroll (within a pixel). */
export function reached(scroller: HTMLElement, axis: Axis, target: number): boolean {
  const max =
    axis === 'y'
      ? scroller.scrollHeight - scroller.clientHeight
      : scroller.scrollWidth - scroller.clientWidth;
  const now = axis === 'y' ? scroller.scrollTop : scroller.scrollLeft;
  return Math.abs(now - Math.min(Math.max(target, 0), max)) <= 1;
}

/**
 * Resolves once `scroller` stops scrolling. Sent somewhere (`arrived` says
 * whether it stands there): on a frame or a `scrollend` where it has arrived,
 * or, stopped elsewhere (a swipe took it over), once it has moved and then
 * stood still for 5 frames and 300 ms; one that has not moved in 60 frames
 * goes nowhere. A `scrollend` short of there is not one: it ends a scroll a
 * focus stopped on its way, which the sheet sends on again, and Safari before
 * 26.2 has none. A page too busy to start the scroll at once does not settle
 * it before it moves. Not sent
 * anywhere (a swipe's momentum running out): on its `scrollend`, or once no
 * `scroll` event has come for 150 ms. Upstream waits on `scrollend` alone.
 */
export function scrollSettled(scroller: HTMLElement, arrived?: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', quiet);
      scroller.removeEventListener('scrollend', done);
      scroller.removeEventListener('scrollend', ended);
      resolve();
    };
    const quiet = () => {
      clearTimeout(timer);
      timer = setTimeout(done, SETTLE_QUIET_MS);
    };
    const ended = () => {
      if (arrived?.()) {
        done();
      }
    };
    if (!arrived) {
      scroller.addEventListener('scrollend', done);
      scroller.addEventListener('scroll', quiet, { passive: true });
      quiet();
      return;
    }
    scroller.addEventListener('scrollend', ended);
    const position = () => `${scroller.scrollLeft},${scroller.scrollTop}`;
    let last = position();
    let moved = false;
    let still = 0;
    let stillSince = 0;
    let frames = 0;
    const look = () => {
      const now = position();
      if (now === last) {
        still += 1;
      } else {
        moved = true;
        still = 0;
        stillSince = performance.now();
        last = now;
      }
      frames += 1;
      const stopped = moved && still >= STILL_FRAMES && performance.now() - stillSince >= STILL_MS;
      if (arrived() || stopped || (!moved && frames > START_FRAMES)) {
        done();
      } else {
        frame = requestAnimationFrame(look);
      }
    };
    look();
  });
}

/** How long a user's gesture that set no scroll off (a wheel at the end) is waited on. */
const GESTURE_IDLE_MS = 500;
/** How long a scroll with a `scrollend` to come may stand still before it is taken as ended. */
const GESTURE_QUIET_MS = 1000;
/** How long a scroll already over (one a layout made) is waited on before it is taken as ended. */
export const SCROLL_OVER_MS = SETTLE_QUIET_MS;

/**
 * Resolves once the scroll a user's gesture set off has ended, its momentum and its snap with
 * it: on `scrollend`, or, where the browser has none (Safari before 26.2), once no `scroll` has
 * come for 150 ms. One that set no scroll off has ended once `idleMs` (500 ms) pass with none;
 * one whose `scrollend` never comes (its container gone), once it has stood still for a second.
 */
export function gestureSettled(scroller: HTMLElement, idleMs = GESTURE_IDLE_MS): Promise<void> {
  return new Promise((resolve) => {
    const ends = 'onscrollend' in window;
    let timer = setTimeout(() => done(), idleMs);
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => done(), ends ? GESTURE_QUIET_MS : SETTLE_QUIET_MS);
    };
    const done = () => {
      clearTimeout(timer);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', done);
      resolve();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    if (ends) {
      scroller.addEventListener('scrollend', done);
    }
  });
}

/** The snap point indices a swipe animation plays between. */
export interface SwipeAnimationRange {
  readonly start?: number | undefined;
  readonly end?: number | undefined;
}

/**
 * The inline animation of a part that moves with the swipe (`swipeAnimation`,
 * a `@keyframes` name authored from exited to entered): bound to the sheet's
 * view timeline where the browser has view timelines. Without them (Firefox),
 * the keyframes play over 300 ms while the sheet enters or exits, and a swipe
 * moves the sheet without them.
 */
export function swipeAnimationStyle(options: {
  readonly name: string | undefined;
  readonly range: SwipeAnimationRange | undefined;
  readonly snapPoints: ReadonlyArray<SnapPoint> | undefined;
  readonly swipeDirection: SheetSwipeDirection;
  readonly index: number;
  readonly entering: boolean;
  readonly exiting: boolean;
}): Record<string, string> {
  const { name, range, snapPoints, swipeDirection } = options;
  if (!name) {
    return {};
  }
  const config = getSwipeConfig(swipeDirection);
  let rangeStart = range?.start != null ? toLength(snapPoints?.[range.start] ?? '0%') : '0%';
  let rangeEnd = range?.end != null ? toLength(snapPoints?.[range.end] ?? '100%') : '100%';
  if (swipeDirection === 'top' || swipeDirection === 'left') {
    [rangeStart, rangeEnd] = [`calc(100% - ${rangeEnd})`, `calc(100% - ${rangeStart})`];
  }
  if (supportsViewTimeline()) {
    return {
      'animation-name': name,
      'animation-timeline': `--sheet-timeline-${options.index}`,
      'animation-direction': config.viewDirection,
      'animation-iteration-count': String(config.viewIterations),
      'animation-fill-mode': 'both',
      'animation-range': `${config.viewRange} ${rangeStart} ${config.viewRange} ${rangeEnd}`,
      'animation-timing-function': 'linear',
      'animation-composition': 'replace',
    };
  }
  if (options.entering || options.exiting) {
    return {
      'animation-name': name,
      'animation-direction': options.exiting ? 'reverse' : 'normal',
      'animation-duration': '300ms',
      'animation-iteration-count': '1',
      'animation-fill-mode': 'both',
      'animation-timing-function': 'linear',
      'animation-composition': 'replace',
    };
  }
  return {};
}
