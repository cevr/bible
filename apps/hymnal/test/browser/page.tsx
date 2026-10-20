/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary -- the browser test's page, a host boundary: plain DOM code that finds the list's scroller and rows, which the DOM gives as nullable elements. */

/**
 * The browser test's page: the Hymns list as the web app shows it, over the
 * real words, in a phone-sized window. A row's press opens its hymn inside
 * the app (`src/test/one.tsx`), and the hymn shows in the list's place, as
 * One's web stack shows a pushed screen. `window.hymnal` lets the test go
 * back to the list, or away from it as a tab switch does, scroll the list
 * as a reader does, and read each time the list moved by itself after the
 * reader scrolled it.
 */

import { RegistryProvider } from '@effect/atom-react';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { opening } from '../../src/test/one';
import { webColors } from '~/color';
import { hymns } from '~/hymns/hymns';
import { HymnList } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

/** A time the list moved by itself: where the reader left it, and where it went. */
export interface Jump {
  readonly left: number;
  readonly went: number;
}

/** What the test drives the page through. */
export interface Hymnal {
  /** Shows the list again, as Back or its tab does. */
  readonly back: () => void;
  /** Shows another screen in the list's place, as a tab switch does. */
  readonly away: () => void;
  /** The hrefs opened inside the app since the page opened. */
  readonly opened: Array<string>;
  /** The list's scroll offset now, and the most it can scroll; none while it is not shown. */
  readonly place: () => { readonly top: number; readonly max: number } | undefined;
  /** Scrolls the list to `top` as a reader does, and answers where the browser took it. */
  readonly scroll: (top: number) => number;
  /** Each time the list moved by itself after the reader last scrolled it, since it was last shown. */
  readonly jumps: Array<Jump>;
  /** The row nearest the window's middle: its name, its centre and its height. */
  readonly middle: () => {
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly height: number;
  };
}

declare global {
  interface Window {
    hymnal: Hymnal;
  }
}

/** The list's rows drawn now, each named "<number>, <title>". */
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[aria-label]')].filter((row) =>
    /^\d+, /.test(row.getAttribute('aria-label') ?? ''),
  );

/** The element that scrolls the list's rows, when the list is shown. */
const scroller = (): HTMLElement | undefined => {
  let node = rows()[0]?.parentElement;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return undefined;
};

/** Where the reader last left the list; none until he scrolls it after it is shown. */
let left: number | undefined;
const jumps: Array<Jump> = [];

document.addEventListener(
  'scroll',
  (event) => {
    const node = scroller();
    if (event.target !== node || node === undefined || left === undefined) return;
    if (Math.abs(node.scrollTop - left) > 1) jumps.push({ left, went: node.scrollTop });
  },
  true,
);

/** The list is shown anew: it may go to its saved place before the reader scrolls it. */
const shownAnew = () => {
  left = undefined;
  jumps.splice(0);
};

function App() {
  const [screen, setScreen] = useState<'list' | 'away'>('list');
  useEffect(() => {
    const opened: Array<string> = [];
    const open = (href: string) => {
      opened.push(href);
      setScreen('away');
    };
    opening.add(open);
    window.hymnal = {
      back: () => {
        shownAnew();
        setScreen('list');
      },
      away: () => setScreen('away'),
      opened,
      place: () => {
        const node = scroller();
        return node && { top: node.scrollTop, max: node.scrollHeight - node.clientHeight };
      },
      scroll: (top) => {
        const node = scroller();
        if (node === undefined) throw new Error('the list is not shown');
        node.scrollTop = top;
        left = node.scrollTop;
        return left;
      },
      jumps,
      middle: () => {
        const boxes = rows().map((row) => ({ row, box: row.getBoundingClientRect() }));
        const seen = boxes.filter(({ box }) => box.top >= 0 && box.bottom <= window.innerHeight);
        const { row, box } = seen[Math.floor(seen.length / 2)] ?? boxes[0] ?? {};
        if (!row || !box) throw new Error('no row on screen');
        return {
          label: row.getAttribute('aria-label') ?? '',
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          height: box.height,
        };
      },
    };
    return () => void opening.delete(open);
  }, []);
  return (
    <RegistryProvider>
      {screen === 'list' ? (
        <HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />
      ) : (
        <div data-away="" />
      )}
    </RegistryProvider>
  );
}

const style = document.createElement('style');
style.textContent = `${webColors}\n#root { display: flex; flex-direction: column; flex: 1; min-height: 0; }`;
document.head.append(style);
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
