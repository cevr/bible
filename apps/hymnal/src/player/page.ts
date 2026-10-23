/**
 * The hymn page the reader sees, for the bottom bar: each hymn page says
 * so while it is mounted (`useShowsPage`), and the last one mounted is the
 * one on top of the stack. A phone's sheet over a page (Settings, the
 * reading sheet) leaves it mounted, so the docked bar keeps acting on it
 * there. The full player does not read it: its route names its hymn.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useEffect } from 'react';

import type { Track } from './player';

/** One mounted hymn page: its hymn, and a mark of its own, as one hymn may be pushed twice. */
interface Shown {
  readonly mark: symbol;
  readonly track: Track;
}

const shownPages = Atom.make<ReadonlyArray<Shown>>([]).pipe(Atom.keepAlive);

/** Says that `track`'s page is shown while the calling screen is mounted. */
export function useShowsPage(track: Track) {
  const set = useAtomSet(shownPages);
  const { number, title } = track;
  useEffect(() => {
    const shown: Shown = { mark: Symbol(number), track: { number, title } };
    set((pages) => [...pages, shown]);
    return () => set((pages) => pages.filter((page) => page.mark !== shown.mark));
  }, [set, number, title]);
}

/** The hymn page on top, if one is shown. */
export const useShownPage = (): Option.Option<Track> =>
  Option.map(Arr.last(useAtomValue(shownPages)), (page) => page.track);
