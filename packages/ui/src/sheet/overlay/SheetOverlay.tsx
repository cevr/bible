// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetOverlay), and packages/react-aria-components/src/Modal.tsx (ModalOverlay's
// viewport and page size variables). Copyright 2022, 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2 and changed: it renders in the dialog's
// portal; a sheet that is not modal stands fixed over a page that stays live
// and scrollable (upstream's is always modal); the variables are left out until
// the browser has measured them; a sheet whose swipe direction changes while it
// is open (a window resized past a breakpoint) rests where it was; a dismissal
// by swipe its owner cancels scrolls the sheet back in.
//
// The container of a sheet's backdrop and popup, and the owner of its motion.
// Opening scrolls the sheet in (smoothly; to its first snap point when it has
// some); closing scrolls it out by the edge it leaves by, and the sheet
// unmounts once that scroll settles. While the sheet scrolls in, focus stays
// where it was and the page is not yet hidden (a screen reader's cursor moving
// in would scroll, and stop the scroll on iOS). An IntersectionObserver
// watches the content: all of it showing is `expanded`, and once it has shown
// and then left the screen entirely (the user scrolled it away), the sheet
// asks to close with the reason `swipe`. Hidden with what holds it, it is not
// gone: it rests again once laid out.
//
// It sets `--visual-viewport-width` and `--visual-viewport-height` (the
// visual viewport's size, which a software keyboard shrinks), and from them
// `--sheet-scroll-padding-x` and `--sheet-scroll-padding-y`: how much of the
// layout viewport the keyboard covers, for the content's padding.
import type { JSX } from '@solidjs/web';
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  omit,
  untrack,
  useContext,
} from 'solid-js';

import { useDialogPortalContext } from '../../dialog/portal/DialogPortal.tsx';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { holdMotion } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { platform } from '../../utils/platform.ts';
import { useSheetRootContext } from '../root/SheetRootContext.ts';
import { type SheetState, sheetStateAttributesMapping } from '../utils/sheetAttributes.ts';
import { registerSheet, type SheetStackEntry, sheetStack } from '../utils/stack.ts';
import {
  cssToPx,
  reached,
  scrollAlongAxis,
  scrollDetentIntoView,
  scrollSettled,
  type SwipeConfig,
  viewportPadding,
  viewportTravel,
} from '../utils/swipe.ts';
import { useViewportSize } from '../utils/viewportSize.ts';

/** What the parts inside the overlay read of the mounted sheet. */
interface SheetOverlayContext {
  /** Its place among the sheets mounted now. */
  index: Accessor<number>;
  /** The sheets in front of it. */
  descendants: Accessor<ReadonlyArray<SheetStackEntry>>;
  /** Whether it has finished scrolling in (false again once it closes). */
  entered: Accessor<boolean>;
  /** The overlay's, backdrop's and popup's state. */
  state: SheetState;
  /** The popup registers its scroll container. */
  setScroller: (element: HTMLElement | null) => void;
  /** The popup reports where a sheet that is not modal rests: its panel's box in the viewport. */
  setRestRect: (rect: RestRect | null) => void;
}

/** A panel's resting box in the viewport, in pixels. */
interface RestRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const SheetOverlayContext = createContext<SheetOverlayContext | null>(null);

export function useSheetOverlayContext(): SheetOverlayContext {
  const context = useContext(SheetOverlayContext);
  if (context === null) {
    throw new Error(
      'SheetOverlayContext is missing. Sheet parts must be placed within <Sheet.Overlay>.',
    );
  }
  return context;
}

interface SheetOverlayProps extends BaseUIComponentProps<'div', SheetState> {}

/**
 * Scrolls the sheet to where it rests open: its first snap point, or all of it
 * showing. Answers that scroll position.
 */
function scrollToRest(scrollElement: HTMLElement, config: SwipeConfig, smooth: boolean): number {
  // Its own marker comes first: a sheet nested in its content renders after it.
  const initial = scrollElement.querySelector<HTMLElement>('[data-sheet-initial]');
  if (initial) {
    return scrollDetentIntoView(
      scrollElement,
      initial,
      config.axis,
      config.after ? 'start' : 'end',
      smooth,
    );
  }
  const rest = (config.enteredScroll / 100) * viewportTravel(config);
  scrollAlongAxis(scrollElement, config.axis, rest, smooth);
  return rest;
}

/** Whether `element` has a layout (nothing round it is `display: none`). */
const laidOut = (element: HTMLElement) => element.getClientRects().length > 0;

/**
 * Resolves once the sheet's scroll to `target` has settled: there, or ended
 * elsewhere (a swipe took it over). With no layout it cannot scroll, and has
 * settled at once: it rests when it is laid out again.
 */
const settledAt = (scrollElement: HTMLElement, axis: SwipeConfig['axis'], target: number) =>
  scrollSettled(
    scrollElement,
    () => !laidOut(scrollElement) || reached(scrollElement, axis, target),
  );

/**
 * How many times a sheet scrolls in smoothly, stopped on its way by a scroll
 * into view, before it is put at rest at once.
 */
const SCROLL_IN_TRIES = 4;

/**
 * Whether a scroll by `delta` along `axis` from `target` is taken by something
 * inside the sheet that scrolls of its own (a long list not yet at its end),
 * not by the sheet: the browser scrolls that first, and chains to the sheet
 * only from its end.
 */
function takenInside(
  target: EventTarget | null,
  scroller: HTMLElement,
  axis: SwipeConfig['axis'],
  delta: number,
) {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== scroller;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') {
      continue;
    }
    const at = axis === 'y' ? element.scrollTop : element.scrollLeft;
    const end =
      axis === 'y'
        ? element.scrollHeight - element.clientHeight
        : element.scrollWidth - element.clientWidth;
    if ((delta > 0 && at < end - 1) || (delta < 0 && at > 0)) {
      return true;
    }
  }
  return false;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** The page's scrollable size, without a fractional pixel (which would give Firefox scrollbars). */
function pageSize() {
  const page = document.scrollingElement ?? document.documentElement;
  const rect = page.getBoundingClientRect();
  return {
    width: page.scrollWidth - (rect.width % 1),
    height: page.scrollHeight - (rect.height % 1),
  };
}

/**
 * A container for the sheet's backdrop and popup.
 * Renders a `<div>` element.
 */
export function SheetOverlay(componentProps: SheetOverlayProps): JSX.Element {
  const { store } = useDialogRootContext();
  const root = useSheetRootContext();
  useDialogPortalContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  const owned = { ownedWrite: true } as const;
  const [scroller, setScroller] = createSignal<HTMLElement | null>(null, owned);
  const [restRect, setRestRect] = createSignal<RestRect | null>(null, {
    ...owned,
    equals: (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.top === b.top &&
        a.left === b.left &&
        a.width === b.width &&
        a.height === b.height),
  });
  // The overlay's own box (the viewport less a classic scrollbar's gutter), for a sheet that is
  // not modal: its clip is inset from these edges.
  const [overlayElement, setOverlayElement] = createSignal<HTMLElement | null>(null, owned);
  const [overlaySize, setOverlaySize] = createSignal<{ width: number; height: number } | null>(
    null,
    {
      ...owned,
      equals: (a, b) => a === b || (!!a && !!b && a.width === b.width && a.height === b.height),
    },
  );
  const [expanded, setExpanded] = createSignal(false, owned);
  const [entered, setEntered] = createSignal(false, owned);

  const id = createUniqueId();
  const place = () => sheetStack().findIndex((entry) => entry.id === id);
  const index = () => Math.max(0, place());
  const descendants = () => {
    const at = place();
    return at < 0 ? [] : sheetStack().slice(at + 1);
  };

  const state: SheetState = {
    get position() {
      return root.position();
    },
    get swipeDirection() {
      return root.swipeDirection();
    },
    get stackIndex() {
      return index();
    },
    get hasDescendants() {
      return descendants().length > 0;
    },
    get expanded() {
      return expanded();
    },
    get entering() {
      return store.open() && !entered();
    },
    get exiting() {
      return store.transitionStatus() === 'ending';
    },
  };

  // Whether any of the content shows now, as the observer last reported.
  let visible = false;
  // The entrance under way, if any, and whether the user's swipe has taken it over.
  let entrance: { taken: boolean } | null = null;

  /** Asks to close as swiped away; an owner that cancels has it scrolled back in. */
  const swipedAway = (scrollElement: HTMLElement, config: SwipeConfig) => {
    const details = createChangeEventDetails(REASONS.swipe);
    store.setOpen(false, details);
    if (details.isCanceled) {
      scrollToRest(scrollElement, config, true);
    }
  };

  // Mounted: watch the content, and join the stack.
  createEffect(
    () => [scroller(), store.popupElement(), root.config()] as const,
    ([scrollElement, content, config]) => {
      if (!content || !scrollElement) {
        return undefined;
      }
      const wasEntered = untrack(entered);
      if (wasEntered) {
        // The geometry changed under the open sheet: it rests where it rested.
        scrollToRest(scrollElement, config, false);
      } else if (config.enteredScroll === 0) {
        // A sheet resting at scroll 0 (top, left) mounts entered: it starts at the exit
        // instead, so the observer does not see it shown and then gone as it scrolls in.
        scrollAlongAxis(
          scrollElement,
          config.axis,
          (config.maxScroll / 100) * viewportTravel(config),
        );
      }
      let shown = wasEntered;
      // A sheet hidden with what holds it (`display: none` round it) has no layout: the
      // observer reports it gone, and the browser drops its scroll position. Neither is a
      // swipe. It must show again before it can be swiped away, and it rests again, at once,
      // when it is laid out. A container resized with the window (its length is the
      // viewport's) rests again too: the browser re-snaps one at rest, but not one still
      // scrolling in, which the new geometry would leave out of view. A ResizeObserver is
      // told before the IntersectionObserver in the same frame.
      let unlaid = false;
      const forget = () => {
        unlaid = true;
        shown = false;
        visible = false;
      };
      let size = '';
      const layout = new ResizeObserver(() => {
        if (!laidOut(scrollElement)) {
          forget();
          return;
        }
        const now = `${scrollElement.clientWidth}x${scrollElement.clientHeight}`;
        const moved = unlaid || (size !== '' && size !== now);
        size = now;
        unlaid = false;
        if (moved && untrack(store.open)) {
          scrollToRest(scrollElement, config, false);
        }
      });
      layout.observe(scrollElement);
      const observer = new IntersectionObserver(
        (entries) => {
          if (!laidOut(scrollElement)) {
            forget();
            return;
          }
          const ratio = entries[entries.length - 1]?.intersectionRatio ?? 0;
          setExpanded(ratio >= 1);
          visible = ratio > 0;
          shown ||= visible;
          // Gone as it scrolls in is a swipe only when the user took the entrance over;
          // otherwise a scroll into view stopped it, and the entrance carries it on to rest.
          if (shown && !visible && untrack(store.open) && !(entrance && !entrance.taken)) {
            swipedAway(scrollElement, config);
          }
        },
        // iOS draws past the reported viewport (behind its toolbar): the sheet is gone only past that too.
        { threshold: [0, 1], rootMargin: `0px 0px ${cssToPx(viewportPadding(config))}px 0px` },
      );
      observer.observe(content);
      const leave = registerSheet({
        id,
        range: config.viewRange,
        direction: config.viewDirection,
        iterations: config.viewIterations,
      });
      return () => {
        layout.disconnect();
        observer.disconnect();
        leave();
      };
    },
  );

  // Opening scrolls the sheet in; closing scrolls it out, holding the unmount until it settles.
  createEffect(
    () => [scroller(), store.open()] as const,
    ([scrollElement, open]) => {
      const content = untrack(store.popupElement);
      if (!scrollElement) {
        return undefined;
      }
      const config = untrack(root.config);
      if (!open) {
        setEntered(false);
        const exit = scrollOut(scrollElement, config);
        if (content) {
          holdMotion(content, exit);
        }
        return undefined;
      }
      if (untrack(entered)) {
        return undefined;
      }
      let live = true;
      // Scrolling in is the sheet's own motion: only the user's swipe (a finger's move or a
      // wheel on the sheet, not on a list in it that scrolls of its own) takes it over. A
      // scroll into view inside it (a focus, a caret revealed, the page's own) stops it where
      // it is, and its snapping may carry it out of view: that is no swipe, and once it has
      // stood it scrolls on to rest. It has entered only once it rests, or the user took it.
      const run = { taken: false };
      entrance = run;
      const take = (target: EventTarget | null, delta: number) => {
        if (delta !== 0 && !takenInside(target, scrollElement, config.axis, delta)) {
          run.taken = true;
        }
      };
      const along = (point: { clientX: number; clientY: number }) =>
        config.axis === 'y' ? point.clientY : point.clientX;
      let finger: number | null = null;
      const onTouchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        finger = touch ? along(touch) : null;
      };
      const onTouchMove = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        const now = along(touch);
        // A finger moving down scrolls up.
        take(event.target, finger === null ? 0 : finger - now);
        finger = now;
      };
      const onWheel = (event: WheelEvent) =>
        take(event.target, config.axis === 'y' ? event.deltaY : event.deltaX);
      const passive = { passive: true } as const;
      scrollElement.addEventListener('touchstart', onTouchStart, passive);
      scrollElement.addEventListener('touchmove', onTouchMove, passive);
      scrollElement.addEventListener('wheel', onWheel, passive);
      const release = () => {
        scrollElement.removeEventListener('touchstart', onTouchStart);
        scrollElement.removeEventListener('touchmove', onTouchMove);
        scrollElement.removeEventListener('wheel', onWheel);
        if (entrance === run) {
          entrance = null;
        }
      };
      const comeIn = (tries: number): Promise<void> => {
        const target = scrollToRest(scrollElement, config, true);
        return settledAt(scrollElement, config.axis, target).then(() => {
          const stopped =
            live &&
            !run.taken &&
            untrack(store.open) &&
            laidOut(scrollElement) &&
            !reached(scrollElement, config.axis, target);
          if (!stopped) {
            return undefined;
          }
          if (tries > 1) {
            return comeIn(tries - 1);
          }
          // Stopped each time: it is put at rest at once.
          scrollToRest(scrollElement, config, false);
          return undefined;
        });
      };
      let start = Promise.resolve();
      if (config.enteredScroll === 0) {
        // Jump to the exit, then scroll in on the next frame: both in one task can leave the
        // browser at the jumped-to position.
        scrollAlongAxis(
          scrollElement,
          config.axis,
          (config.maxScroll / 100) * viewportTravel(config),
        );
        start = nextFrame();
      }
      const enter = start
        .then(() => {
          if (!live) {
            return undefined;
          }
          return comeIn(SCROLL_IN_TRIES);
        })
        .then(() => {
          release();
          if (!live || !untrack(store.open)) {
            return;
          }
          setEntered(true);
          // The user's swipe took the entrance over and carried it out of view: a swipe away.
          if (run.taken && !visible && laidOut(scrollElement)) {
            swipedAway(scrollElement, config);
          }
        });
      if (content) {
        holdMotion(content, enter);
      }
      return () => {
        live = false;
        release();
      };
    },
  );

  function scrollOut(scrollElement: HTMLElement, config: SwipeConfig): Promise<void> {
    if (!visible) {
      // Swiped away already. Desktop Safari's momentum would carry on into the sheet
      // behind: it unmounts once the scroll has stopped.
      return platform.engine.webkit && !platform.os.ios
        ? scrollSettled(scrollElement).then(() => delay(50))
        : Promise.resolve();
    }
    const travel = viewportTravel(config);
    const max = (config.maxScroll / 100) * travel;
    const current = config.axis === 'y' ? scrollElement.scrollTop : scrollElement.scrollLeft;
    let target: number;
    if (config.after && !config.before) {
      target = 0;
    } else if (config.before && !config.after) {
      target = max;
    } else {
      // Either edge: the nearer one.
      target = current > (config.enteredScroll / 100) * travel ? max : 0;
    }
    scrollAlongAxis(scrollElement, config.axis, target, true);
    return settledAt(scrollElement, config.axis, target);
  }

  const viewport = useViewportSize();
  const page = createMemo(() => (viewport() && store.modal() ? pageSize() : undefined));

  // A sheet that is not modal stands fixed over a page that stays live: it takes presses (and
  // so the swipe) exactly where its panel rests, and it is clipped there, its panel's shadow
  // with it (an owner draws one round the overlay). A clip that followed the panel would leave
  // the container out of the hit test, and Chromium does not scroll a container a wheel misses.
  // It takes presses even inside an element that takes none (that owner's wrapper).
  const looseStyle = (): JSX.CSSProperties => {
    const rect = restRect();
    const box = overlaySize();
    if (!rect || !box) {
      return { position: 'fixed', inset: '0', 'pointer-events': 'none' };
    }
    const right = box.width - rect.left - rect.width;
    const bottom = box.height - rect.top - rect.height;
    return {
      position: 'fixed',
      inset: '0',
      'pointer-events': 'auto',
      'clip-path': `inset(${rect.top}px ${right}px ${bottom}px ${rect.left}px)`,
    };
  };

  createEffect(
    () => [overlayElement(), store.modal()] as const,
    ([element, modal]) => {
      if (!element || modal) {
        return undefined;
      }
      const measure = () =>
        setOverlaySize({ width: element.clientWidth, height: element.clientHeight });
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => {
        observer.disconnect();
        setOverlaySize(null);
      };
    },
  );

  const style = (): JSX.CSSProperties => {
    const size = viewport();
    const pageNow = page();
    return {
      // A modal sheet stands on the page (absolute, not fixed, so iOS Safari does not clip it),
      // over a page whose scroll is locked.
      ...(store.modal()
        ? {
            position: 'absolute',
            top: '0',
            left: '0',
            width: 'max(var(--page-width, 100vw), 100vw)',
            height: 'max(var(--page-height, 100dvh), 100dvh)',
          }
        : looseStyle()),
      overflow: 'clip',
      '--sheet-scroll-padding-x': 'calc(100vw - var(--visual-viewport-width, 100vw))',
      '--sheet-scroll-padding-y': 'calc(100dvh - var(--visual-viewport-height, 100dvh))',
      ...(size && {
        '--visual-viewport-width': `${size.width}px`,
        '--visual-viewport-height': `${size.height}px`,
      }),
      ...(pageNow && {
        '--page-width': `${pageNow.width}px`,
        '--page-height': `${pageNow.height}px`,
      }),
    };
  };

  const context: SheetOverlayContext = {
    index,
    descendants,
    entered,
    state,
    setScroller: (element) => setScroller(() => element),
    setRestRect: (rect) => setRestRect(() => rect),
  };

  return (
    <SheetOverlayContext value={context}>
      {useRenderElement('div', componentProps, {
        state,
        ref: (element: HTMLElement) => setOverlayElement(() => element),
        stateAttributesMapping: sheetStateAttributesMapping,
        props: [
          {
            get style() {
              return style();
            },
          },
          elementProps,
        ],
      })}
    </SheetOverlayContext>
  );
}
