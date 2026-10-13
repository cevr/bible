// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetOverlay), and packages/react-aria-components/src/Modal.tsx (ModalOverlay's
// viewport and page size variables). Copyright 2022, 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2 and changed: it renders in the dialog's
// portal; a sheet that is not modal stands fixed over a page that stays live
// and scrollable, and takes presses over its panel alone (upstream's is always modal);
// the variables are left out until the browser has measured them; an open
// sheet rests for the layout it has now, whatever changed it (a window resized
// past a breakpoint turns it to another edge), and one scrolling in goes on to
// that rest; a swipe is the user's gesture that carried it out of view, never
// a scroll a layout made; a dismissal by swipe its owner cancels scrolls the
// sheet back in.
//
// The container of a sheet's backdrop and popup, and the owner of its motion.
// Opening scrolls the sheet in (smoothly; to its first snap point when it has
// some); closing scrolls it out by the edge it leaves by, and the sheet
// unmounts once that scroll settles. While the sheet scrolls in, focus stays
// where it was and the page is not yet hidden (a screen reader's cursor moving
// in would scroll, and stop the scroll on iOS). An IntersectionObserver
// watches the content: all of it showing is `expanded`. A gesture of the
// user's on the sheet (a finger's drag that scrolls it, a wheel or a key that
// can) that carries it out of view asks to close with the reason `swipe`: at
// once with no finger on it (its snap may bring it back), or as the finger
// lifts, or once its momentum and snap run out. An input that moves nothing is
// no gesture. A sheet carried out of view by anything else (a layout that
// clamped its scroll, a script) rests again once that scroll is over and no
// input of the user's turned out to be behind it. Hidden with what holds it, it is
// not gone: it rests again once laid out.
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
  type Axis,
  cssToPx,
  gestureSettled,
  reached,
  type Rest,
  restAt,
  scrollAlongAxis,
  SCROLL_OVER_MS,
  scrollSettled,
  type SwipeConfig,
  viewportPadding,
  viewportTravel,
} from '../utils/swipe.ts';
import { followTouches } from '../utils/hand.ts';
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
  /**
   * Whether a finger of the user's is swiping the sheet: its container scrolled under the finger
   * as it moved, and its drag, its fling and its snap are not yet over. Changes as the swipe
   * starts and ends, not each frame.
   */
  fingerSwipes: Accessor<boolean>;
}

/** A sheet's scroll in, under way. */
interface Entrance {
  /** Whether the user's gesture has taken it over: where it goes then is the user's. */
  taken: boolean;
  /** The rest it was last sent to; none until it has set off. */
  aimed: Rest | null;
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

/** Whether two rests differ: another axis, or more than a pixel apart. */
const restMoved = (from: Rest, to: Rest) =>
  from.axis !== to.axis || Math.abs(from.target - to.target) > 1;

/** Scrolls the sheet to where it rests open (`restAt`); answers that rest. */
function scrollToRest(scrollElement: HTMLElement, config: SwipeConfig, smooth: boolean): Rest {
  const rest = restAt(scrollElement, config);
  scrollAlongAxis(scrollElement, rest.axis, rest.target, smooth);
  return rest;
}

/** iOS draws past the reported viewport (behind its toolbar): the sheet is gone only past that too. */
const rootMargin = (config: SwipeConfig) => `0px 0px ${cssToPx(viewportPadding(config))}px 0px`;

/**
 * Resolves with whether any of `content` shows now, as an IntersectionObserver with the sheet's
 * `rootMargin` reports it: its first report is of the layout drawn next.
 */
const showsNow = (content: Element, rootMargin: string) =>
  new Promise<boolean>((resolve) => {
    const once = new IntersectionObserver(
      (entries) => {
        once.disconnect();
        resolve((entries[entries.length - 1]?.intersectionRatio ?? 0) > 0);
      },
      { threshold: [0], rootMargin },
    );
    once.observe(content);
  });

/** The scroll each key that scrolls makes along an axis, its sign the way it goes. */
const KEY_SCROLLS: Readonly<Record<Axis, Readonly<Record<string, number>>>> = {
  y: { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1, Home: -1, End: 1, ' ': 1 },
  x: { ArrowLeft: -1, ArrowRight: 1 },
};

/** Whether `element` has a layout (nothing round it is `display: none`). */
const laidOut = (element: HTMLElement) => element.getClientRects().length > 0;

/**
 * How soon after the user's input a scroll of the sheet's container is the input's: the browser
 * scrolls under a moving finger in the same frame, lets go of a fling within a frame or two, and
 * starts a wheel's or a key's scroll on the next frame. A scroll under a finger that stands
 * still, or long after an input, is a layout's.
 */
const INPUT_SCROLL_MS = 100;

/**
 * Whether the browser is desktop WebKit, which snaps a wheel's scroll back to the open snap at
 * once and, about 90 ms later, on to the snap the wheel went toward.
 */
const snapsTwice = () => platform.engine.webkit && !platform.os.ios;

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
  const [expanded, setExpanded] = createSignal(false, owned);
  const [entered, setEntered] = createSignal(false, owned);
  const [fingerSwipes, setFingerSwipes] = createSignal(false, owned);

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
  // Whether it has shown since it was last laid out: until then, out of view is no news.
  let shown = false;
  // The entrance under way, if any.
  let entrance: Entrance | null = null;
  // Whether this opening has asked its owner to close as swiped away: once is all, however long
  // the owner keeps `open` before it drops the sheet. An owner that cancels may be asked again.
  let swipeAsked = false;
  // The user's fingers on the sheet, by touch identifier, and where each last was along the
  // axis: a finger that went down on it (its touches are the sheet's however far it moves),
  // never one on the page. While any is down, where the sheet stands is the user's.
  const fingers = new Map<number, number>();
  // The user's gesture on the sheet under way, by what made it (`finger` once its container has
  // scrolled under a moving finger, `other` for a wheel or a key that can scroll it): from an
  // input of theirs that scrolls the sheet until the scroll it set off, its momentum and its snap
  // with it, has ended and been looked at (`seeOut`). Only such a scroll swipes it away. An input
  // that cannot move the sheet (toward the end it stands at, a still finger, a drag a list in it
  // takes) is no gesture.
  let gesture: 'finger' | 'other' | null = null;
  // Counts the gesture's inputs: a look at its end is the latest input's, or nobody's.
  let gestureInputs = 0;

  /** The user's gesture becomes `to`; a finger's swipe starting or ending is told to the popup. */
  const setGesture = (to: 'finger' | 'other' | null) => {
    gesture = to;
    setFingerSwipes(to === 'finger');
  };

  /** Whether the user's hand has the sheet: a finger of theirs on it, or their gesture under way. */
  const handHas = () => fingers.size > 0 || gesture !== null;

  /** Sends the entrance `run` on, smoothly, to where the sheet rests for the layout it has now. */
  const aim = (scrollElement: HTMLElement, run: Entrance) => {
    run.aimed = scrollToRest(scrollElement, untrack(root.config), true);
  };

  /**
   * Puts a sheet that has entered where it rests for the layout it has now, at once, unless a
   * finger of the user's has it. Called as the layout changes under it: the container laid out
   * again or resized (the window), the swipe direction changed (the owner turned the sheet to
   * another edge). A sheet at rest whose panel alone moves needs nothing: the browser keeps a
   * container at rest snapped to the snap point it rests at. One still scrolling in looks each
   * frame for itself (see the entrance).
   */
  const settle = (scrollElement: HTMLElement) => {
    if (fingers.size > 0) {
      // The layout moved under the hand: where it leaves the sheet now is the layout's doing,
      // not a swipe of the user's, until they move it again.
      setGesture(null);
      return;
    }
    if (untrack(store.open) && untrack(entered) && laidOut(scrollElement)) {
      scrollToRest(scrollElement, untrack(root.config), false);
    }
  };

  /**
   * Looks where the sheet was left once the scroll that moved it has ended (a finger down, then
   * or as the look is taken, holds it until the finger lifts). Out of view, a gesture of the
   * user's swiped it away; with none (a hand that only held it while a layout carried it out, or
   * no hand at all) it rests again. The look is the latest input's; a later one starts it over.
   * `idleMs` is how long a scroll already over is waited on: the user's input behind a scroll the
   * browser ran ahead of the page (a finger's fling, the page busy) reaches the page by then, and
   * makes it theirs. A wheel's gesture in desktop WebKit that leaves the sheet in view `lingers`
   * that long too: a scroll the browser starts by then is still the gesture's (it snaps a
   * wheel's scroll back at once, then about 90 ms later on to the snap the wheel went toward),
   * and is looked at once it ends.
   */
  const seeOut = (scrollElement: HTMLElement, idleMs?: number, lingers = false) => {
    gestureInputs += 1;
    const input = gestureInputs;
    const latest = () => input === gestureInputs;
    void gestureSettled(scrollElement, idleMs)
      .then(() => {
        if (!latest() || fingers.size > 0) {
          return null;
        }
        const content = untrack(store.popupElement);
        if (!content || !laidOut(scrollElement)) {
          // Not laid out (hidden with what holds it): nothing to look at, and no swipe.
          setGesture(null);
          return null;
        }
        return showsNow(content, rootMargin(untrack(root.config)));
      })
      .then((shows) => {
        // A finger that went down while the look was taken has the sheet: its lift looks again.
        if (shows === null || !latest() || fingers.size > 0) {
          return;
        }
        const swiped = gesture !== null;
        if (shows && swiped && lingers) {
          seeOut(scrollElement, SCROLL_OVER_MS);
          return;
        }
        setGesture(null);
        if (shows || !untrack(store.open) || swipeAsked) {
          return;
        }
        if (swiped) {
          swipedAway(scrollElement);
        } else if (untrack(entered)) {
          scrollToRest(scrollElement, untrack(root.config), false);
        }
      });
  };

  /**
   * Follows the user's hand on the sheet for as long as its container is mounted, whatever its
   * swipe direction becomes (its axis is read as each input comes): the fingers that went down
   * on it, and the inputs that scroll it. A finger is the sheet's from its `touchstart` there;
   * its moves and its lift are heard on the window (`followTouches`, one subscription for every
   * sheet), as they go to the element it went down on even once that has left the sheet (a row
   * re-rendered under it), where the sheet would not hear them.
   *
   * An input is a gesture only once the sheet's container has scrolled for it: under a finger as
   * it moves (or the fling it just let go of), or the way a wheel or a scroll key went, soon after
   * it. One that moves nothing (toward the end the sheet stands at, a drag or a wheel a list in
   * it takes, a finger that stands still) is no gesture, and a scroll a layout makes meanwhile is
   * not made the user's by it. Judged by the scroll, not by where the container stands as the
   * input is heard: the browser may have scrolled for a wheel before the page hears of it. The
   * gesture takes over an entrance under way; a wheel's or a key's scroll is looked at once it
   * ends, a finger's once it lifts. Answers the listeners' removal.
   */
  const followHand = (scrollElement: HTMLElement) => {
    const axis = () => untrack(root.config).axis;
    const along = (touch: Touch) => (axis() === 'y' ? touch.clientY : touch.clientX);
    const position = () => (axis() === 'y' ? scrollElement.scrollTop : scrollElement.scrollLeft);
    // When a finger of the sheet's last moved.
    let movedAt = -Infinity;
    // The latest wheel or scroll key on the sheet, its sign the way it scrolls, until the
    // container scrolls that way or it is too late to.
    let input: { readonly way: number; readonly at: number; readonly byWheel: boolean } | null =
      null;
    // Where the container stood at its last scroll.
    let last = position();
    const onTouchStart = (event: TouchEvent) => {
      for (const touch of event.changedTouches) {
        fingers.set(touch.identifier, along(touch));
      }
    };
    const stopFollowing = followTouches({
      move: (event) => {
        for (const touch of event.changedTouches) {
          const last = fingers.get(touch.identifier);
          const now = along(touch);
          if (last !== undefined && now !== last) {
            fingers.set(touch.identifier, now);
            movedAt = performance.now();
          }
        }
      },
      lift: (event) => {
        let lifted = false;
        for (const touch of event.changedTouches) {
          lifted = fingers.delete(touch.identifier) || lifted;
        }
        if (!lifted || fingers.size > 0) {
          return;
        }
        // The last finger lifted with the sheet out of view, its swipe took it there: it is
        // swiped away at once (a layout may move it before its fling ends). Lifted in view, what
        // it set off (a fling, a snap) is the gesture's too, and where the hand leaves the sheet
        // is looked at once that ends.
        if (
          gesture !== null &&
          shown &&
          !visible &&
          untrack(store.open) &&
          laidOut(scrollElement)
        ) {
          swipedAway(scrollElement);
        } else {
          seeOut(scrollElement);
        }
      },
    });
    const onScroll = () => {
      const now = performance.now();
      const at = position();
      const moved = at - last;
      last = at;
      if (now - movedAt <= INPUT_SCROLL_MS) {
        if (gesture !== 'finger') {
          setGesture('finger');
          if (entrance) {
            entrance.taken = true;
          }
        }
        return;
      }
      if (input && now - input.at <= INPUT_SCROLL_MS && Math.sign(moved) === input.way) {
        const { byWheel } = input;
        input = null;
        setGesture(gesture === 'finger' ? 'finger' : 'other');
        if (entrance) {
          entrance.taken = true;
        }
        seeOut(scrollElement, undefined, byWheel && snapsTwice());
      }
    };
    /** A wheel or a scroll key went `delta` along the axis: a gesture if the sheet scrolls for it. */
    const scrollsBy = (delta: number, byWheel: boolean) => {
      if (delta !== 0) {
        input = { way: Math.sign(delta), at: performance.now(), byWheel };
      }
    };
    const onWheel = (event: WheelEvent) =>
      scrollsBy(axis() === 'y' ? event.deltaY : event.deltaX, true);
    const onKeyDown = (event: KeyboardEvent) => {
      const way = KEY_SCROLLS[axis()][event.key];
      if (way !== undefined && !event.defaultPrevented) {
        scrollsBy(event.key === ' ' && event.shiftKey ? -way : way, false);
      }
    };
    const passive = { passive: true } as const;
    scrollElement.addEventListener('touchstart', onTouchStart, passive);
    scrollElement.addEventListener('scroll', onScroll, passive);
    scrollElement.addEventListener('wheel', onWheel, passive);
    scrollElement.addEventListener('keydown', onKeyDown);
    return () => {
      stopFollowing();
      scrollElement.removeEventListener('touchstart', onTouchStart);
      scrollElement.removeEventListener('scroll', onScroll);
      scrollElement.removeEventListener('wheel', onWheel);
      scrollElement.removeEventListener('keydown', onKeyDown);
      fingers.clear();
      setGesture(null);
      gestureInputs += 1;
    };
  };

  /** Asks to close as swiped away, once an opening; an owner that cancels has it scrolled back in. */
  const swipedAway = (scrollElement: HTMLElement) => {
    if (swipeAsked) {
      return;
    }
    swipeAsked = true;
    const details = createChangeEventDetails(REASONS.swipe);
    store.setOpen(false, details);
    if (details.isCanceled) {
      swipeAsked = false;
      scrollToRest(scrollElement, untrack(root.config), true);
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
      if (!wasEntered && !entrance && config.enteredScroll === 0) {
        // A sheet resting at scroll 0 (top, left) mounts entered: it starts at the exit
        // instead, so the observer does not see it shown and then gone as it scrolls in.
        scrollAlongAxis(
          scrollElement,
          config.axis,
          (config.maxScroll / 100) * viewportTravel(config),
        );
      }
      // Its swipe direction changed under it: it settles for the layout it has now.
      settle(scrollElement);
      shown = wasEntered;
      // A sheet hidden with what holds it (`display: none` round it) has no layout: the
      // observer reports it gone, and the browser drops its scroll position. Neither is a
      // swipe. It must show again before it can be swiped away, and it settles when it is laid
      // out again. A container resized with the window (its length is the viewport's) settles
      // too, unless a finger on the sheet has it; one still scrolling in sees the change for
      // itself. A ResizeObserver is told before the IntersectionObserver in the same frame. A
      // layout that clamped the container's scroll and was gone before it was drawn (the window
      // shorter, or turned, and back within a frame) leaves its size as it was, and nothing
      // resized: the observer sees the sheet carried out of view, by no gesture of the user's,
      // and it rests again.
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
        if (moved) {
          settle(scrollElement);
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
          // Carried out of view by the user's gesture, no finger on it now (a wheel's, a key's, a
          // fling's), it is swiped away at once: the scroll's snap may bring it back before the
          // gesture ends. Out of view under a finger is theirs to say once it lifts (see
          // `seeOut`). Gone with no hand on it is no swipe: once the scroll that carried it is
          // over, and no input of the user's turned out to be behind it, it rests again, unless
          // it is still scrolling in on its own, which carries it on to rest itself.
          if (shown && !visible && untrack(store.open) && !swipeAsked) {
            if (gesture !== null && fingers.size === 0) {
              swipedAway(scrollElement);
            } else if (!handHas() && !(entrance && !entrance.taken)) {
              seeOut(scrollElement, SCROLL_OVER_MS);
            }
          }
        },
        { threshold: [0, 1], rootMargin: rootMargin(config) },
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

  // Mounted: follow the user's hand on it, through every change of its swipe direction.
  createEffect(
    () => scroller(),
    (scrollElement) => (scrollElement ? followHand(scrollElement) : undefined),
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
      // A new opening: its swipe away has not been asked.
      swipeAsked = false;
      let live = true;
      // Scrolling in is the sheet's own motion: only the user's gesture takes it over (see
      // `followHand`). A scroll into view inside it (a focus, a caret revealed, the page's
      // own) stops it where it is, and its snapping may carry it out of view: that is no swipe,
      // and once it has stood it scrolls on to rest. Where it rests is the layout's now, not
      // the layout's as it set off: each frame it looks where it rests (`restAt`), and a rest
      // that moved on its way (a window resized or turned past a breakpoint, to another edge of
      // the same axis too, its panel moved by its owner) sends it on there, unless the user's
      // gesture has taken it. It has entered only once it rests, or the user took it.
      const run: Entrance = { taken: false, aimed: null };
      entrance = run;
      const release = () => {
        if (entrance === run) {
          entrance = null;
        }
      };
      const restNow = () => restAt(scrollElement, untrack(root.config));
      const there = () => {
        const rest = restNow();
        return reached(scrollElement, rest.axis, rest.target);
      };
      const comeIn = (tries: number): Promise<void> => {
        aim(scrollElement, run);
        return scrollSettled(scrollElement, () => {
          if (!laidOut(scrollElement)) {
            return true;
          }
          if (live && !run.taken && (!run.aimed || restMoved(run.aimed, restNow()))) {
            aim(scrollElement, run);
            return false;
          }
          return there();
        }).then(() => {
          const stopped =
            live && !run.taken && untrack(store.open) && laidOut(scrollElement) && !there();
          if (!stopped) {
            return undefined;
          }
          if (tries > 1) {
            return comeIn(tries - 1);
          }
          // Stopped each time: it is put at rest at once.
          scrollToRest(scrollElement, untrack(root.config), false);
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
          // Taken over by the user's gesture, it is theirs: where it ends is looked at as the
          // gesture ends (`seeOut`).
          setEntered(true);
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
        : // One that is not modal stands fixed over a page that stays live, and takes no
          // presses: once the sheet is in, its container takes them (and the swipe) over its
          // panel's box, clipped to it (see `SheetPopup`); while it scrolls in or out, the panel
          // takes its own; and the page takes them everywhere else.
          { position: 'fixed', inset: '0', 'pointer-events': 'none' }),
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
    fingerSwipes,
  };

  return (
    <SheetOverlayContext value={context}>
      {useRenderElement('div', componentProps, {
        state,
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
