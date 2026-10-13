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
// a scroll a layout made, nor one a layout changed under; a dismissal by swipe
// its owner cancels scrolls the sheet back in.
//
// The container of a sheet's backdrop and popup, and the owner of its motion.
// Opening scrolls the sheet in (smoothly; to its first snap point when it has
// some); closing scrolls it out by the edge it leaves by, and the sheet
// unmounts once that scroll settles. While the sheet scrolls in, focus stays
// where it was and the page is not yet hidden (a screen reader's cursor moving
// in would scroll, and stop the scroll on iOS). An IntersectionObserver
// watches the content: all of it showing is `expanded`.
//
// Each scroll of its container is judged by its evidence, one classifier for
// all: a layout's when its layout moved in that frame (the window or its
// visual viewport resized, the container or the panel resized or laid out
// again, the panel moved in it); the user's finger's when a finger of theirs
// is down on it and the scroll goes the finger's way and about as far; a
// wheel's or a key's when it goes their way soon after them; the gesture's
// under way once one has started; otherwise the sheet's own while it scrolls
// in, and a layout's once it has. A layout's scroll rests the sheet again, at
// once (or by sending its entrance on), and while the user's hand has it, as
// that hand lets go. A gesture of the user's that carried the sheet out of view
// asks to close with the reason `swipe`, read from the panel's box as it ends
// (the last finger lifts, the momentum and the snap run out) or at once with no
// finger on it (its snap may bring it back), and only when no layout moved
// during it: one that did rests instead. An input that moves nothing is no
// gesture. Hidden with what holds it, it is not gone: it rests again once laid
// out.
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
  atARest,
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
import { followWindow } from '../utils/hand.ts';
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

/** The input a gesture of the user's came from. */
type InputKind = 'finger' | 'wheel' | 'key';

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
 * Whether none of `content` shows now, read from its box as drawn (its transforms with it) against
 * the window, past its end edge by the sheet's padding there, as the sheet's IntersectionObserver
 * counts it: read at once, not a frame on.
 */
function outNow(content: Element, config: SwipeConfig): boolean {
  const box = content.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight + cssToPx(viewportPadding(config));
  return (
    box.width <= 0 ||
    box.height <= 0 ||
    box.right <= 0 ||
    box.bottom <= 0 ||
    box.left >= width ||
    box.top >= height
  );
}

/**
 * The layout the sheet stands in, as the scroll and the rest read it: its container's size and
 * scroll extent, and where its panel stands in it and how big it is (from layout offsets, which a
 * swipe's or a stack's transforms leave alone); `none` with no layout. A change of it is a layout
 * moving under the sheet.
 */
function layoutOf(scroller: HTMLElement, panel: HTMLElement | null) {
  if (!laidOut(scroller)) {
    return { frame: 'none', panel: 'none' };
  }
  let x = 0;
  let y = 0;
  let element: HTMLElement | null = panel;
  while (element && element !== scroller) {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent as HTMLElement | null;
  }
  return {
    frame: `${scroller.clientWidth}x${scroller.clientHeight}`,
    panel: `${scroller.scrollWidth}x${scroller.scrollHeight} ${x},${y} ${panel?.offsetWidth}x${panel?.offsetHeight}`,
  };
}

/** The scroll each key that scrolls makes along an axis, its sign the way it goes. */
const KEY_SCROLLS: Readonly<Record<Axis, Readonly<Record<string, number>>>> = {
  y: { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1, Home: -1, End: 1, ' ': 1 },
  x: { ArrowLeft: -1, ArrowRight: 1 },
};

/** Whether `element` has a layout (nothing round it is `display: none`). */
const laidOut = (element: HTMLElement) => element.getClientRects().length > 0;

/**
 * How soon after a wheel, a scroll key or a finger's lift a scroll of the sheet's container is the
 * input's: the browser starts a wheel's or a key's scroll on the next frame, and lets go of a
 * fling within a frame or two. Long after an input, a scroll is a layout's.
 */
const INPUT_SCROLL_MS = 100;

/**
 * How far a scroll under a finger may run past the finger's own travel since the last scroll and
 * still be the finger's: the browser scrolls on the compositor, ahead of the moves the page hears
 * (measured in Chromium: up to about 82 px, a step and a third, on a fling of 65 px steps; within
 * 15 px on a slow drag, its touch slop with it), so the slack is 32 px or two of the finger's
 * largest steps, whichever is more.
 */
const fingerSlack = (largestStep: number) => Math.max(32, 2 * largestStep);

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
  // scrolled under a moving finger, `other` for a wheel, a key, or a fling let go of), the input
  // it came from, and the layout epoch it began in: from an input of theirs that scrolls the
  // sheet until the scroll it set off, its momentum and its snap with it, has ended and been
  // looked at (`seeOut`). Only such a scroll swipes it away, and only when no layout moved
  // during it. An input that cannot move the sheet (toward the end it stands at, a still finger,
  // a drag a list in it takes) is no gesture. A new input of another kind, or a finger put down
  // again, ends the gesture before it (a wheel's stream of events is one gesture).
  let gesture: {
    readonly by: 'finger' | 'other';
    readonly from: InputKind;
    readonly epoch: number;
  } | null = null;
  // Counts the looks asked for: a look is the latest one's, or nobody's.
  let looks = 0;
  // Counts the layouts the sheet has stood in: each window or visual viewport resize, each change
  // of its container's or its panel's layout (`layoutOf`), each change of its swipe direction.
  let epoch = 0;
  // Whether a layout moved in the frame running now: the browser clamps or snaps a container's
  // scroll for a layout in the frame it lays it out, or the next, and any scroll then is the
  // layout's, under a moving finger too. Cleared by the next animation frame.
  let fresh = false;
  // The layout last read (`layoutOf`).
  let layout = { frame: 'none', panel: 'none' };
  // Whether a layout moved the sheet while the user's hand had it: it rests once the hand lets go.
  let movedByLayout = false;
  // The rest the sheet was last put at, at once, until its scroll there is heard: its own.
  let restedAt: Rest | null = null;

  /** The user's gesture becomes `to`; a finger's swipe starting or ending is told to the popup. */
  const setGesture = (to: typeof gesture) => {
    gesture = to;
    setFingerSwipes(to?.by === 'finger');
  };

  /** Whether a layout moved since `of` began: it is no swipe then, wherever it leaves the sheet. */
  const crossed = (of: NonNullable<typeof gesture>) => of.epoch !== epoch || movedByLayout;

  /** Whether the user's hand has the sheet: a finger of theirs on it, or their gesture under way. */
  const handHas = () => fingers.size > 0 || gesture !== null;

  /** Whether the sheet is scrolling in on its own, not taken over by the user. */
  const selfEntering = () => entrance !== null && !entrance.taken;

  /** A layout moved under the sheet: a new epoch, and this frame's scrolls are the layout's. */
  const layoutMoved = () => {
    epoch += 1;
    if (!fresh) {
      fresh = true;
      requestAnimationFrame(() => {
        fresh = false;
      });
    }
  };

  /**
   * Reads the layout the sheet stands in; a change is a layout moved (`layoutMoved`). Answers
   * whether it changed, and whether its container's own box did (laid out again, resized).
   */
  const checkLayout = (scrollElement: HTMLElement) => {
    const now = layoutOf(scrollElement, untrack(store.popupElement));
    const framed = now.frame !== layout.frame;
    const moved = framed || now.panel !== layout.panel;
    layout = now;
    if (moved) {
      layoutMoved();
    }
    return { moved, framed };
  };

  /** Sends the entrance `run` on, smoothly, to where the sheet rests for the layout it has now. */
  const aim = (scrollElement: HTMLElement, run: Entrance) => {
    run.aimed = scrollToRest(scrollElement, untrack(root.config), true);
  };

  /**
   * Puts the sheet where it rests for the layout it has now, at once (that scroll is its own),
   * unless it stands at a rest already: there, or at another of its snap points (`atARest`).
   */
  const restNow = (scrollElement: HTMLElement) => {
    if (!atARest(scrollElement, untrack(root.config))) {
      restedAt = scrollToRest(scrollElement, untrack(root.config), false);
    }
  };

  /**
   * Rests the sheet again after a layout moved it, or changed under it: a scroll that was not the
   * user's (`scrolled`, rested once it is over: a script's may run on), or a change of its
   * container's own box (laid out again, resized), or of its swipe direction (rested at once).
   * Scrolling in on its own, its entrance is sent on to the rest it has now. While the user's
   * hand has it, it is left to the hand, marked moved by a layout: it rests as the hand lets go,
   * never swiped away.
   */
  const restAfterLayout = (scrollElement: HTMLElement, scrolled: boolean) => {
    if (!untrack(store.open) || swipeAsked || !laidOut(scrollElement)) {
      return;
    }
    if (handHas()) {
      movedByLayout = true;
      return;
    }
    if (entrance && !entrance.taken) {
      aim(scrollElement, entrance);
      return;
    }
    if (scrolled) {
      movedByLayout = true;
      seeOut(scrollElement, SCROLL_OVER_MS);
    } else if (untrack(entered) || entrance) {
      restNow(scrollElement);
    }
  };

  /**
   * Looks where the sheet was left once the scroll that moved it has ended (a finger down, then
   * or as the look is taken, holds it until the finger lifts), from its panel's box then. Out of
   * view, a gesture of the user's that no layout crossed swiped it away. Otherwise it rests
   * again, unless it stands at a rest already (`restNow`: a snap point the user left it at
   * stays). The look is the latest one's;
   * a later one starts it over. `idleMs` is how long a scroll already over is waited on: the
   * user's input behind a scroll the browser ran ahead of the page (a finger's fling, the page
   * busy) reaches the page by then, and makes it theirs. A wheel's gesture in desktop WebKit that
   * leaves the sheet in view `lingers` that long too: a scroll the browser starts by then is
   * still the gesture's (it snaps a wheel's scroll back at once, then about 90 ms later on to
   * the snap the wheel went toward), and is looked at once it ends.
   */
  const seeOut = (scrollElement: HTMLElement, idleMs?: number, lingers = false) => {
    looks += 1;
    const look = looks;
    void gestureSettled(scrollElement, idleMs).then(() => {
      // A finger that went down meanwhile has the sheet: its lift looks again.
      if (look !== looks || fingers.size > 0) {
        return;
      }
      const content = untrack(store.popupElement);
      if (!content || !laidOut(scrollElement)) {
        // Not laid out (hidden with what holds it): nothing to look at, and no swipe. It rests
        // once laid out again.
        setGesture(null);
        movedByLayout = false;
        return;
      }
      const config = untrack(root.config);
      const out = outNow(content, config);
      const by = gesture;
      if (by && lingers && !out && !crossed(by)) {
        seeOut(scrollElement, SCROLL_OVER_MS);
        return;
      }
      const layoutHad = movedByLayout || (by !== null && crossed(by));
      setGesture(null);
      movedByLayout = false;
      if (!untrack(store.open) || swipeAsked) {
        return;
      }
      if (by && !layoutHad && out && shown) {
        swipedAway(scrollElement);
      } else if (!selfEntering()) {
        restNow(scrollElement);
      }
    });
  };

  /**
   * Follows the user's hand on the sheet for as long as its container is mounted, whatever its
   * swipe direction becomes (its axis is read as each input comes): the fingers that went down
   * on it, and the inputs that scroll it. A finger is the sheet's from its `touchstart` there;
   * its moves and its lift are heard on the window (`followWindow`, one subscription for every
   * sheet), as they go to the element it went down on even once that has left the sheet (a row
   * re-rendered under it), where the sheet would not hear them.
   *
   * Each scroll of the container is judged as it comes (see the file's head): a layout's first,
   * when the layout moved in its frame or under it; under a finger of the sheet's, the finger's
   * when it goes the way the finger drives it and no further than the finger's travel since the
   * last scroll and the slack the compositor runs ahead by (`fingerSlack`); else a gesture's
   * under way; else, soon after a wheel, a scroll key or the last finger's lift, theirs when it
   * goes their way; else the sheet's own while it scrolls in on its own, and a layout's after.
   * Judged by the scroll, not by where the container stands as the input is heard: the browser
   * may have scrolled for a wheel before the page hears of it. A gesture takes over an entrance
   * under way; a wheel's or a key's scroll is looked at once it ends, a finger's as it lifts.
   * Answers the listeners' removal.
   */
  const followHand = (scrollElement: HTMLElement) => {
    const axis = () => untrack(root.config).axis;
    const along = (touch: Touch) => (axis() === 'y' ? touch.clientY : touch.clientX);
    const position = () => (axis() === 'y' ? scrollElement.scrollTop : scrollElement.scrollLeft);
    // The latest wheel, scroll key or last lift on the sheet, its sign the way it scrolls and the
    // epoch it came in, until the container scrolls that way or it is too late to.
    let input: {
      readonly way: number;
      readonly at: number;
      readonly from: InputKind;
      readonly epoch: number;
    } | null = null;
    // The epoch the hand's first finger went down in.
    let handEpoch = 0;
    // The fingers' travel along the axis since the container last scrolled, each way; the way
    // the latest move went; the largest single move since the first finger went down.
    let plus = 0;
    let minus = 0;
    let lastWay = 0;
    let largestStep = 0;
    // Where the container stood at its last scroll.
    let last = position();
    /**
     * A new input of the user's (`from`), no finger down: it ends the gesture before it (its look
     * still rests the sheet if that one leaves it short of a rest), unless both are a wheel's (one
     * stream), and the sheet's layout is read again before it is taken in.
     */
    const heard = (from: InputKind) => {
      if (fingers.size === 0 && !(from === 'wheel' && gesture?.from === 'wheel')) {
        setGesture(null);
        movedByLayout = false;
      }
      if (checkLayout(scrollElement).moved) {
        restAfterLayout(scrollElement, false);
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      if (fingers.size === 0) {
        heard('finger');
        handEpoch = epoch;
        plus = 0;
        minus = 0;
        lastWay = 0;
        largestStep = 0;
      }
      for (const touch of event.changedTouches) {
        fingers.set(touch.identifier, along(touch));
      }
    };
    const stopFollowing = followWindow({
      move: (event) => {
        for (const touch of event.changedTouches) {
          const was = fingers.get(touch.identifier);
          const now = along(touch);
          if (was !== undefined && now !== was) {
            fingers.set(touch.identifier, now);
            const step = now - was;
            if (step > 0) {
              plus += step;
            } else {
              minus -= step;
            }
            lastWay = Math.sign(step);
            largestStep = Math.max(largestStep, Math.abs(step));
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
        const by = gesture;
        const content = untrack(store.popupElement);
        // The last finger lifted with the sheet out of view, its swipe, which no layout crossed,
        // took it there: it is swiped away at once (a layout may move it before its fling ends).
        if (
          by !== null &&
          !crossed(by) &&
          shown &&
          content !== null &&
          untrack(store.open) &&
          laidOut(scrollElement) &&
          outNow(content, untrack(root.config))
        ) {
          swipedAway(scrollElement);
          return;
        }
        // A layout moved it while the hand had it: it rests now, whatever the hand did, and again
        // once what the lift set off (a fling, the browser's snap) has ended (`seeOut`).
        if (movedByLayout || (by !== null && crossed(by))) {
          movedByLayout = true;
          if (entrance && !entrance.taken) {
            aim(scrollElement, entrance);
          } else if (untrack(store.open) && !swipeAsked && laidOut(scrollElement)) {
            restNow(scrollElement);
          }
        }
        // Lifted in view, what it set off (a fling, a snap) is the gesture's too, the fling's
        // first scroll the finger's way however late it reaches the page, and where the hand
        // leaves the sheet is looked at once that ends.
        if (by === null && lastWay !== 0) {
          input = { way: -lastWay, at: performance.now(), from: 'finger', epoch: handEpoch };
        }
        seeOut(scrollElement);
      },
      resize: () => layoutMoved(),
    });
    /**
     * Whether a scroll by `moved` is the fingers' on the sheet: their way, and about as far. While
     * it scrolls in on its own, its entrance's motion is in the scroll too, and the way alone
     * says it: a finger that takes it over.
     */
    const fingersDrive = (moved: number) => {
      const way = -Math.sign(moved);
      const travel = way > 0 ? plus : minus;
      return (
        (travel > 0 || lastWay === way) &&
        (selfEntering() || Math.abs(moved) <= travel + fingerSlack(largestStep))
      );
    };
    /**
     * The user's gesture takes the sheet (`by`, from the input `from`), from the epoch its input
     * came in: a gesture under way keeps its own.
     */
    const take = (by: 'finger' | 'other', from: InputKind, since: number) => {
      setGesture({
        by: by === 'finger' || gesture?.by === 'finger' ? 'finger' : 'other',
        from: gesture?.from ?? from,
        epoch: gesture ? gesture.epoch : since,
      });
      if (entrance) {
        entrance.taken = true;
      }
    };
    const onScroll = () => {
      const now = performance.now();
      const at = position();
      const moved = at - last;
      last = at;
      const own = restedAt;
      restedAt = null;
      if (!untrack(store.open) || swipeAsked || moved === 0) {
        return;
      }
      if (own && reached(scrollElement, own.axis, own.target)) {
        // The sheet's own rest, heard.
        return;
      }
      const relaid = checkLayout(scrollElement).moved;
      const driven = fingers.size > 0 && fingersDrive(moved);
      plus = 0;
      minus = 0;
      if (relaid || fresh) {
        restAfterLayout(scrollElement, true);
        return;
      }
      if (fingers.size > 0) {
        if (driven) {
          if (gesture?.by !== 'finger') {
            take('finger', 'finger', handEpoch);
          }
        } else {
          stray();
        }
        return;
      }
      if (gesture !== null) {
        return;
      }
      if (input && now - input.at <= INPUT_SCROLL_MS && Math.sign(moved) === input.way) {
        const { from, epoch: since } = input;
        input = null;
        take('other', from, since);
        seeOut(scrollElement, undefined, from === 'wheel' && snapsTwice());
        return;
      }
      stray();
    };
    /**
     * A scroll no input of the user's explains: the sheet's own while it scrolls in on its own,
     * or one that leaves it at a rest (its entrance's last, heard once it has entered; a snap
     * point a script scrolled it to); otherwise a layout's (a script's, a clamp no observer saw),
     * and it rests again once it is over.
     */
    const stray = () => {
      if (selfEntering() || atARest(scrollElement, untrack(root.config))) {
        return;
      }
      layoutMoved();
      restAfterLayout(scrollElement, true);
    };
    /** A wheel or a scroll key went `delta` along the axis: a gesture if the sheet scrolls for it. */
    const scrollsBy = (delta: number, from: InputKind) => {
      if (delta !== 0) {
        heard(from);
        input = { way: Math.sign(delta), at: performance.now(), from, epoch };
      }
    };
    const onWheel = (event: WheelEvent) =>
      scrollsBy(axis() === 'y' ? event.deltaY : event.deltaX, 'wheel');
    const onKeyDown = (event: KeyboardEvent) => {
      const way = KEY_SCROLLS[axis()][event.key];
      if (way !== undefined && !event.defaultPrevented) {
        scrollsBy(event.key === ' ' && event.shiftKey ? -way : way, 'key');
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
      movedByLayout = false;
      looks += 1;
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
      // Mounted, or its swipe direction changed under it (its owner turned it to another edge): a
      // layout moved, and it rests for the layout it has now.
      checkLayout(scrollElement);
      layoutMoved();
      restAfterLayout(scrollElement, false);
      shown = wasEntered;
      // A sheet hidden with what holds it (`display: none` round it) has no layout: the
      // observer reports it gone, and the browser drops its scroll position. Neither is a
      // swipe. It must show again before it can be swiped away, and it rests when it is laid
      // out again. Its container resized (with the window: its length is the viewport's), laid
      // out again, or its panel resized: a layout moved, and the container's own box changed
      // rests it (`restAfterLayout`). A ResizeObserver is told before the IntersectionObserver
      // in the same frame.
      const forget = () => {
        shown = false;
        visible = false;
      };
      const relaid = new ResizeObserver(() => {
        if (!laidOut(scrollElement)) {
          forget();
        }
        if (checkLayout(scrollElement).framed) {
          restAfterLayout(scrollElement, false);
        }
      });
      relaid.observe(scrollElement);
      relaid.observe(content);
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
          // Carried out of view by the user's gesture that no layout crossed, no finger on it now
          // (a wheel's, a key's, a fling's), it is swiped away at once, as its box reads now: the
          // scroll's snap may bring it back before the gesture ends. Out of view under a finger
          // is theirs to say once it lifts; anything else that carried it out rested it again as
          // it scrolled (see `followHand`).
          if (
            shown &&
            !visible &&
            untrack(store.open) &&
            !swipeAsked &&
            gesture !== null &&
            fingers.size === 0 &&
            !crossed(gesture) &&
            outNow(content, untrack(root.config))
          ) {
            swipedAway(scrollElement);
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
        relaid.disconnect();
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
