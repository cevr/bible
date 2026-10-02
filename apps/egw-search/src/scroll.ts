/* oxlint-disable effect/noGlobals -- this module is the page's scroll position: `window.scrollY`, `scrollTo`, its events and the tab's session storage are what it wraps. */
/* oxlint-disable effect/noNullish -- `sessionStorage.getItem` returns `string | null`; that is the platform's signature. */
/* oxlint-disable effect/noNewPromise -- `settled` hands a promise to the traversal below, which waits on it beside a timer; both are plain browser callbacks. */

/**
 * Scroll position, per history entry.
 *
 * A new search keeps the page where it is — a push is not a new page — and
 * Back or Forward returns to the position the reader left that entry at. The
 * browser's own restoration cannot do the second: it scrolls on `popstate`,
 * before the entry's results are drawn, so it lands on a page of the wrong
 * height. So the app turns it off (`layerBrowser({ scrollRestoration:
 * 'manual' })` in `./index.tsx`) and restores the position here instead, once
 * the reads the entry started have settled (`trackRead`), or after
 * {@link TRAVERSAL_READ_LIMIT} if they have not.
 *
 * Entries are told apart by the key `@bible/url-state` gives each one
 * (`UrlAtom.entry`): a push makes a new key, a replace keeps it. The position
 * of the entry on screen is kept as the reader scrolls, and once more at the
 * moment Back or Forward leaves it. The positions live in the tab's session
 * storage, so a reload lands where the reader was, and Back after a reload
 * still finds the older entries' positions.
 */

import { useRegistry } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { Option, Result, Schema as S } from 'effect';
import { onCleanup } from 'solid-js';

/** How long Back or Forward waits for the entry's reads before it scrolls. */
const TRAVERSAL_READ_LIMIT = 3000;

/** Where the positions outlive a reload: the latest {@link KEPT_ENTRIES},
 *  oldest first. Storage may refuse (a private window, a full quota); the
 *  positions then last for this load only. */
const STORAGE_KEY = 'egw-search:scroll';
const KEPT_ENTRIES = 100;
const StoredPositions = S.fromJsonString(S.Array(S.Tuple([S.String, S.Finite])));
const decodeStored = S.decodeUnknownOption(StoredPositions);
const encodeStored = S.encodeSync(StoredPositions);

const loadPositions = (): Map<string, number> => {
  const stored = Result.getOrElse(
    Result.try(() => window.sessionStorage.getItem(STORAGE_KEY)),
    () => null,
  );
  return new Map(Option.getOrElse(decodeStored(stored), () => []));
};

const positions = loadPositions();

const persist = (): void => {
  const kept = [...positions].slice(-KEPT_ENTRIES);
  void Result.try(() => window.sessionStorage.setItem(STORAGE_KEY, encodeStored(kept)));
};

/** Keep `y` as the position of entry `key`, as its latest. */
const keep = (key: string, y: number): void => {
  positions.delete(key);
  positions.set(key, y);
};

/** Reads in flight for the entry on screen, and who waits for them to end. */
let reads = 0;
let waiting: (() => void)[] = [];

/** Count a read the page started, so a traversal can wait for it. */
export const trackRead = <A>(read: Promise<A>): Promise<A> => {
  reads += 1;
  const done = (): void => {
    reads -= 1;
    if (reads > 0) return;
    const wake = waiting;
    waiting = [];
    for (const resume of wake) resume();
  };
  read.then(done, done);
  return read;
};

const settled = (): Promise<void> =>
  new Promise((resolve) => {
    if (reads === 0) {
      resolve();
      return;
    }
    waiting.push(resolve);
    window.setTimeout(resolve, TRAVERSAL_READ_LIMIT);
  });

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

/**
 * Keeps and restores the scroll position of each history entry, for as long
 * as the calling component lives. Call it once, under the registry the URL
 * atoms live in.
 */
export const useScrollMemory = (): void => {
  const registry = useRegistry();
  /** The key of the entry on screen. */
  let onScreen = registry.get(UrlAtom.entry).key;
  /** The number of traversals started; a later one supersedes an earlier. */
  let traversals = 0;

  const restore = (key: string): void => {
    traversals += 1;
    const traversal = traversals;
    const target = Option.getOrElse(Option.fromUndefinedOr(positions.get(key)), () => 0);
    // One frame for the URL to flush and each pane to start its read, then
    // the reads themselves, then one frame for the rows to be laid out.
    void nextFrame()
      .then(settled)
      .then(nextFrame)
      .then(() => {
        if (traversal !== traversals || onScreen !== key) return;
        window.scrollTo(0, target);
      });
  };

  const onScroll = (): void => keep(onScreen, window.scrollY);
  // A reload or a close leaves the entry without a navigation to save it.
  const onPageHide = (): void => {
    keep(onScreen, window.scrollY);
    persist();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', onPageHide);

  // Back and Forward land here synchronously, inside `popstate`, so the page
  // has not been redrawn yet and `scrollY` is still where the reader left the
  // entry. A push lands after its first redraw, so its position comes from
  // the scroll events instead.
  const unsubscribe = registry.subscribe(UrlAtom.entry, (entry) => {
    if (entry.key === onScreen) return;
    if (entry.navigation === 'traverse') keep(onScreen, window.scrollY);
    onScreen = entry.key;
    persist();
    if (entry.navigation === 'traverse') restore(entry.key);
  });

  // A reload lands on the entry's saved position, once its reads have settled.
  if (positions.has(onScreen)) restore(onScreen);

  onCleanup(() => {
    unsubscribe();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pagehide', onPageHide);
  });
};
