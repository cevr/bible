/* oxlint-disable effect/noGlobals -- this module is the browser's location: `window`, `history` and `location` are what it wraps, and nothing else in the app touches them. */
/* oxlint-disable effect/noNullish -- `history.state` is `unknown`, and `history.pushState` takes it as its first argument; both are the platform's signature. */
/* oxlint-disable effect/noNewPromise -- `settled` hands a promise to the traversal below, which waits on it beside a timer; both are plain browser callbacks. */

/**
 * The browser's location, as a signal, and the only writes to it.
 *
 * `./url-state.ts` says what a query string means; this module owns which
 * query string the tab is on. Every pane reads the workspace from
 * `currentPanes()` and changes it through `updateWorkspace`, so the URL stays
 * the one copy of the state and Back and Forward need no code of their own:
 * a history entry restores an older URL, the signal changes, and each pane's
 * query re-runs.
 *
 * **Scroll position, per entry.** A new search keeps the page where it is — a
 * push is not a new page — and Back or Forward returns to the position the
 * reader left that entry at. The browser's own restoration cannot do the
 * second: it scrolls on `popstate`, before the entry's results are drawn, so it
 * lands on a page of the wrong height. The position is restored here instead,
 * once the reads the entry started have settled (`trackRead`), or after
 * {@link TRAVERSAL_READ_LIMIT} if they have not.
 */

import { Option, Schema as S } from 'effect';
import { createSignal, type Accessor } from 'solid-js';

import { parseWorkspace, toWorkspaceString, type SearchParams } from './url-state.js';

const [search, setSearch] = createSignal(window.location.search);

/** Every pane's parameters, in order, as the URL names them. */
export const currentPanes: Accessor<readonly SearchParams[]> = () => parseWorkspace(search());

/** Whether this tab is on the app's one address. Any other path is the
 *  not-found page: the server answers every unknown path with the app. */
export const isHome = (): boolean => window.location.pathname === '/';

// ---------------------------------------------------------------------------
// Scroll positions
// ---------------------------------------------------------------------------

/** How long Back or Forward waits for the entry's reads before it scrolls. */
const TRAVERSAL_READ_LIMIT = 3000;

/** Each entry carries a key in `history.state`; its position is kept here
 *  against that key. The first entry of a visit has no state yet. */
const FIRST_ENTRY = 'first';

const EntryState = S.Struct({ key: S.String });
const readEntryState = S.decodeUnknownOption(EntryState);

/** The key of the entry whose state this is. */
const entryKey = (state: typeof window.history.state): string =>
  Option.match(readEntryState(state), {
    onNone: () => FIRST_ENTRY,
    onSome: (entry) => entry.key,
  });

const positions = new Map<string, number>();
let current = entryKey(window.history.state);

// The app restores positions itself; see the module note.
window.history.scrollRestoration = 'manual';

const saveScroll = (): void => {
  positions.set(current, window.scrollY);
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

/** The number of traversals started; a later one supersedes an earlier. */
let traversals = 0;

const restoreScroll = (key: string): void => {
  traversals += 1;
  const traversal = traversals;
  const target = positions.get(key) ?? 0;
  // One frame for the signal to flush and each pane to start its read, then
  // the reads themselves, then one frame for the rows to be laid out.
  void nextFrame()
    .then(settled)
    .then(nextFrame)
    .then(() => {
      if (traversal !== traversals || current !== key) return;
      window.scrollTo(0, target);
    });
};

window.addEventListener('popstate', (event) => {
  saveScroll();
  current = entryKey(event.state);
  setSearch(window.location.search);
  restoreScroll(current);
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

let entries = 0;

const newKey = (): string => {
  entries += 1;
  return `${String(Date.now())}-${String(entries)}`;
};

/**
 * Change the workspace.
 *
 * Functional: `update` receives the workspace as the URL holds it *now*, not
 * as some pane last read it, so two changes in one moment compose rather than
 * the second overwriting the first.
 *
 * `replace` is for a refinement of the same search — a filter on results
 * already on screen — so the back button returns to the previous *query*
 * rather than walking back through each toggle the reader tried. Anything
 * else pushes, because it is a place the reader may want to come back to.
 */
export const updateWorkspace = (
  update: (panes: readonly SearchParams[]) => readonly SearchParams[],
  options?: { readonly replace?: boolean },
): void => {
  const next = toWorkspaceString(update(parseWorkspace(window.location.search)));
  if (next === `${window.location.pathname}${window.location.search}`) return;
  if (options?.replace === true) {
    window.history.replaceState({ key: current }, '', next);
  } else {
    saveScroll();
    current = newKey();
    window.history.pushState({ key: current }, '', next);
  }
  setSearch(window.location.search);
};
