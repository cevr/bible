/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary, effect/noGlobals, effect/noNewPromise -- the browser test's page, a host boundary: plain DOM code that finds the list's scroller and rows, which the DOM gives as nullable elements, and answers the test's waits as promises. */

/**
 * The browser test's page script: it hydrates the server's HTML of the app
 * (`app.tsx`, rendered by `server.tsx`) with `hydrateRoot`, at once or, with
 * `?hold` in the address, when the test says (so it can scroll the server's
 * list first). `window.hymnal` lets the test read what hydration said, the
 * list's place and its drawn rows, scroll the list as a reader does, and
 * read each time the list moved by itself after the reader scrolled it.
 */

import { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { App } from './app';

/** A time the list moved by itself: where the reader left it, and where it went. */
export interface Jump {
  readonly left: number;
  readonly went: number;
}

/** A row drawn on screen: its name, its centre and its height. */
export interface Seen {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** The first frame that draws a list come back. */
export interface First {
  readonly drawn: boolean;
  readonly blank: number;
  /** Frames before it that drew the scroller with no row. */
  readonly empty: number;
}

/** What the test drives the page through. */
export interface Hymnal {
  /** What hydration reported: each recoverable error, and each console error about hydration. */
  readonly errors: Array<string>;
  /** Whether the page has hydrated. */
  hydrated: boolean;
  /**
   * Whether a trusted scroll event reached the list's scroller while
   * `hydrate()` had not yet been called: a scroll the list cannot have seen,
   * so it must be told of it. Set at the event; a page loads with it false.
   */
  eventBeforeHydration: boolean;
  /**
   * Waits for that event: answers once a trusted scroll event has reached
   * the list's scroller before hydration, and fails when none has within a
   * second.
   */
  readonly heard: () => Promise<void>;
  /** Hydrates the page now (with `?hold`; without it, it hydrated as it loaded). */
  readonly hydrate: () => void;
  /** The list's scroll offset now, and the most it can scroll; none while no list is shown. */
  readonly place: () => { readonly top: number; readonly max: number } | undefined;
  /** Scrolls the list to `top` as a reader does, and answers where the browser took it. */
  readonly scroll: (top: number) => number;
  /** Each time the list moved by itself after the reader last scrolled it. */
  readonly jumps: Array<Jump>;
  /** Whether the app shows the screen at `path` (the address changes before it). */
  readonly on: (path: string) => boolean;
  /** Whether a list is shown with a row fully on screen. */
  readonly showing: () => boolean;
  /** The fully shown row nearest the list's middle. */
  readonly middle: () => Seen;
  /** How many pixels of the list's shown part, where it has rows, show no row. */
  readonly blank: () => number;
  /**
   * Answers, in the first frame that draws the list at `path` with rows,
   * whether the row named `label` is fully on screen, and how many pixels of
   * rows on screen are blank; and how many frames before it drew the list's
   * scroller with no row.
   */
  readonly watch: (path: string, label: string) => Promise<First>;
  /** The last `watch` asked for. */
  watching?: Promise<First>;
  /**
   * Scrolls the list three rows from `top` toward its middle, as the
   * reader's last scroll but one, and answers once the list has had that
   * scroll's event and its end: the list then knows that offset, not `top`.
   */
  readonly away: (top: number) => Promise<number>;
  /**
   * Moves the list to its top as soon as it comes back: in the microtask
   * after the change to the page that drew it at an offset, as a reader's
   * move at once would. Answers that offset when it has moved it, or 0
   * when no list came back at an offset within two seconds.
   */
  readonly early: () => Promise<number>;
  /**
   * Leaves the list in one task, as a reader who scrolls and presses at
   * once: scrolls it to `top`, then clicks the fully shown row nearest its
   * middle, or the tab bar's link named `tab`. Answers the offset it left
   * at and the row.
   */
  readonly leave: (top: number, tab?: string) => { readonly top: number; readonly label: string };
  /**
   * Whether the list the last `leave` left is out of the page, and no
   * scroll event, the browser's or a dispatched one, reached its scroller
   * while it was in the page after `leave` scrolled it: the list never heard
   * of that scroll, as with a press at once. False when the list heard of
   * it, as after a pause, or is still in the page.
   */
  readonly leftBeforeScrollEvent: () => boolean;
}

declare global {
  interface Window {
    hymnal: Hymnal;
  }
}

/** The element that scrolls the list, when a list is shown. */
const scroller = (): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('#root div')].find((node) =>
    /(auto|scroll)/.test(getComputedStyle(node).overflowY),
  );

/** The list's rows drawn now, each named "<number>, <title>". */
const rows = (node: HTMLElement) =>
  [...node.querySelectorAll<HTMLElement>('[aria-label]')].filter((row) =>
    /^\d+, /.test(row.getAttribute('aria-label') ?? ''),
  );

/** The rows fully inside the list's window. */
const shown = (node: HTMLElement) => {
  const view = node.getBoundingClientRect();
  return rows(node)
    .map((row) => ({ row, box: row.getBoundingClientRect() }))
    .filter(({ box }) => box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5);
};

/** The fully shown row nearest the list's middle. */
const middleOf = (node: HTMLElement) => {
  const seen = shown(node);
  const found = seen[Math.floor(seen.length / 2)];
  if (!found) throw new Error('no row on screen');
  return found;
};

/** How many pixels of the list's shown part, where it has rows, show no row. */
const blankOf = (node: HTMLElement) => {
  const view = node.getBoundingClientRect();
  const top = view.top;
  // The rows end where the content ends: past the last row the list is rightly empty.
  const bottom = Math.min(view.bottom, view.top + node.scrollHeight - node.scrollTop);
  const covered = rows(node)
    .map((row) => row.getBoundingClientRect())
    .map((box) => [Math.max(top, box.top), Math.min(bottom, box.bottom)] as const)
    .filter(([from, to]) => to > from)
    .toSorted(([a], [b]) => a - b);
  let reached = top;
  let gaps = 0;
  for (const [from, to] of covered) {
    if (from > reached) gaps += from - reached;
    reached = Math.max(reached, to);
  }
  if (bottom > reached) gaps += bottom - reached;
  return Math.round(gaps);
};

const errors: Array<string> = [];
const jumps: Array<Jump> = [];

/** Where the reader last left the list, and its scroller then. */
let left: { readonly node: HTMLElement; readonly top: number } | undefined;

/** When the reader last turned a wheel: the scrolls it makes are his. */
let wheeled = -Infinity;

/** The scroller the last `leave` left, and whether a scroll event reached it in the page since. */
let departure: { readonly node: HTMLElement; heard: boolean } | undefined;

addEventListener('wheel', () => void (wheeled = performance.now()), {
  capture: true,
  passive: true,
});

document.addEventListener(
  'scroll',
  (event) => {
    const node = scroller();
    if (node === undefined || event.target !== node) return;
    if (performance.now() - wheeled < 300) {
      left = { node, top: node.scrollTop };
      return;
    }
    if (left === undefined || left.node !== node) return;
    if (Math.abs(node.scrollTop - left.top) > 1)
      jumps.push({ left: left.top, went: node.scrollTop });
  },
  true,
);

/** Whether `hydrate()` has been called. */
let hydrating = false;

/** What `heard()` does when the event comes, while it waits. */
let onHeard: (() => void) | undefined;

// Apart from the jump listener above, so what it sees stays as it was. The
// browser's own event alone counts: the list's `told()` dispatches an untrusted
// one after hydration.
document.addEventListener(
  'scroll',
  (event) => {
    if (hydrating || !event.isTrusted || event.target !== scroller()) return;
    window.hymnal.eventBeforeHydration = true;
    onHeard?.();
  },
  true,
);

const report = console.error.bind(console);
console.error = (...args: Array<unknown>) => {
  const said = args.map(String).join(' ');
  if (/hydrat/i.test(said)) errors.push(said);
  report(...args);
};

function Hydrated() {
  useEffect(() => {
    window.hymnal.hydrated = true;
  }, []);
  return null;
}

window.hymnal = {
  errors,
  hydrated: false,
  eventBeforeHydration: false,
  heard: () =>
    new Promise<void>((done, fail) => {
      const late = setTimeout(() => {
        onHeard = undefined;
        fail(new Error('no scroll event on the list before hydration within a second'));
      }, 1000);
      const heard = () => {
        onHeard = undefined;
        clearTimeout(late);
        done();
      };
      if (window.hymnal.eventBeforeHydration) heard();
      else onHeard = heard;
    }),
  hydrate: () => {
    if (hydrating) return;
    hydrating = true;
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    hydrateRoot(
      root,
      <>
        <App path={location.pathname} />
        <Hydrated />
      </>,
      { onRecoverableError: (error) => void errors.push(String(error)) },
    );
  },
  place: () => {
    const node = scroller();
    return node && { top: node.scrollTop, max: node.scrollHeight - node.clientHeight };
  },
  scroll: (top) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    node.scrollTop = top;
    left = { node, top: node.scrollTop };
    return node.scrollTop;
  },
  jumps,
  on: (path) => document.getElementById(`screen:${path}`) !== null,
  showing: () => {
    const node = scroller();
    return node !== undefined && shown(node).length > 0;
  },
  middle: () => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    const { row, box } = middleOf(node);
    return {
      label: row.getAttribute('aria-label') ?? '',
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      height: box.height,
    };
  },
  blank: () => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    return blankOf(node);
  },
  watch: (path, label) =>
    new Promise<First>((done) => {
      let empty = 0;
      const look = () => {
        const node = window.hymnal.on(path) ? scroller() : undefined;
        if (node === undefined || rows(node).length === 0) {
          if (node !== undefined) empty += 1;
          requestAnimationFrame(look);
          return;
        }
        done({
          drawn: shown(node).some(({ row }) => row.getAttribute('aria-label') === label),
          blank: blankOf(node),
          empty,
        });
      };
      requestAnimationFrame(look);
    }),
  early: () =>
    new Promise<number>((done) => {
      const late = setTimeout(() => {
        observer.disconnect();
        done(0);
      }, 2000);
      const observer = new MutationObserver(() => {
        const node = scroller();
        if (node === undefined || node.scrollTop <= 0) return;
        observer.disconnect();
        clearTimeout(late);
        const at = node.scrollTop;
        node.scrollTop = 0;
        left = { node, top: node.scrollTop };
        done(at);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }),
  away: (top) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    // Three rows: more than the one row a return may miss by, so a list that
    // kept the offset of its last scroll event, not the one it is at, misses.
    const nudge = 3 * 44;
    const max = node.scrollHeight - node.clientHeight;
    node.scrollTop = top > max / 2 ? top - nudge : top + nudge;
    left = { node, top: node.scrollTop };
    const at = node.scrollTop;
    // Past the list's scroll end, which it tells 100 ms after the scroll's
    // event; a scroll with no event within a second fails, as a wait does.
    return new Promise<number>((done, fail) => {
      const late = setTimeout(() => fail(new Error(`no scroll event at ${at}`)), 1000);
      node.addEventListener(
        'scroll',
        () => {
          clearTimeout(late);
          setTimeout(() => done(at), 150);
        },
        { once: true },
      );
    });
  },
  leave: (top, tab) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    // Listening from before the scroll, so its event is heard whenever it comes; one that comes
    // once the scroller is out of the page reaches no list.
    const heard = { node, heard: false };
    departure = heard;
    node.addEventListener('scroll', () => {
      if (node.isConnected) heard.heard = true;
    });
    node.scrollTop = top;
    left = { node, top: node.scrollTop };
    const { row } = middleOf(node);
    const target =
      tab === undefined
        ? row
        : [...document.querySelectorAll<HTMLElement>('[role="navigation"] a')].find(
            (link) => link.textContent === tab,
          );
    if (target === undefined) throw new Error(`no link to ${tab}`);
    target.click();
    return { top: left.top, label: row.getAttribute('aria-label') ?? '' };
  },
  leftBeforeScrollEvent: () =>
    departure !== undefined && !departure.node.isConnected && !departure.heard,
};

if (!new URLSearchParams(location.search).has('hold')) window.hymnal.hydrate();
