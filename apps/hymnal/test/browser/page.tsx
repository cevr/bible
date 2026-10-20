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
  /** Hydrates the page now (with `?hold`; without it, it hydrated as it loaded). */
  readonly hydrate: () => void;
  /** The list's scroll offset now, and the most it can scroll; none while no list is shown. */
  readonly place: () => { readonly top: number; readonly max: number } | undefined;
  /** Scrolls the list to `top` as a reader does, and answers where the browser took it. */
  readonly scroll: (top: number) => number;
  /** Each time the list moved by itself after the reader last scrolled it. */
  readonly jumps: Array<Jump>;
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
   * Leaves the list in one task, as a reader who scrolls and presses at
   * once: scrolls it three rows, then clicks the fully shown row nearest
   * its middle, or the tab bar's link named `tab`. Answers the offset it
   * left at and the row.
   */
  readonly leave: (tab?: string) => { readonly top: number; readonly label: string };
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

let hydrating = false;

window.hymnal = {
  errors,
  hydrated: false,
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
        const node = location.pathname === path ? scroller() : undefined;
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
  leave: (tab) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    // Three rows: more than the one row a return may miss by, so a list that
    // kept the offset of its last scroll event, not the one it is at, misses.
    const nudge = 3 * 44;
    node.scrollTop += node.scrollTop >= nudge ? -nudge : nudge;
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
};

if (!new URLSearchParams(location.search).has('hold')) window.hymnal.hydrate();
