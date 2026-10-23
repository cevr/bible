/**
 * What the hymn route's screen is made of on every platform: the page's
 * chord reader, the header (`hymnHeader`), the hymns the web builds a page for,
 * and the mark that tells the bottom bar which hymn's page is shown and
 * keeps it in Recent. The web
 * shows one hymn per route (`HymnScreen.tsx`); a phone swipes between hymns
 * (`HymnScreen.native.tsx`).
 */

import { useAtomSet } from '@effect/atom-react';
import bundled from 'virtual:hymnal-chords';
import { Option, Record } from 'effect';
import { useEffect } from 'react';

import { chordBook } from '~/hymns/chords';
import { hymnAt, hymns } from '~/hymns/hymns';
import { useShowsPage } from '~/player/page';
import type { Track } from '~/player/player';
import type { Header, Headers, RouteParams } from '~/stack';
import { settings } from '~/store';

import { ChordsButton, HeaderButtons, ReadingButton } from './HeaderButtons';
import type { ChordReader } from './HymnPage';
import { visited } from './lists';

/** The page's chords: the stored switch and moves, and every hymn's chords, each decoded on first view; and how the page is set. */
export const reader: ChordReader = {
  chords: settings.chords,
  move: settings.move,
  book: chordBook(bundled),
  reading: settings.reading,
  favourites: settings.lists.favourites,
};

/** The header's buttons on every hymn's page. */
const headerRight = () => (
  <HeaderButtons>
    <ReadingButton />
    <ChordsButton chords={reader.chords} />
  </HeaderButtons>
);

/**
 * The hymn route's header, from the route's number alone: the hymn's title
 * and the page's buttons, or `No hymn <n>` for a number with no hymn. The
 * stack reads it as it lays the screen out (`useStackOptions`), so it is
 * right on the first frame of every way in: a list's row, a search's result,
 * a link, a cold start, a pager's settle and an unknown number.
 */
export const hymnHeader = (params: RouteParams): Header => {
  const asked = Option.getOrElse(Record.get(params, 'number'), () => '');
  return Option.match(hymnAt(asked), {
    onNone: () => ({ title: `No hymn ${asked}`.trim() }),
    onSome: (hymn) => ({ title: hymn.title, headerRight }),
  });
};

/** The stack's headers that follow their route: each hymn's, by its route's name (`app/(hymnal)/hymns/[number].tsx`). */
export const stackHeaders: Headers = { 'hymns/[number]': hymnHeader };

/** Every hymn's page is rendered when the web is built. */
export const hymnParams = () => hymns.map((hymn) => ({ number: String(hymn.number) }));

/**
 * Tells the bottom bar this hymn's page is shown, for as long as it is, and
 * puts the hymn first in Recent as it opens, or as the pager settles on it.
 */
export function Shown({ hymn }: { readonly hymn: Track }) {
  useShowsPage(hymn);
  const recent = useAtomSet(settings.lists.recent);
  useEffect(() => recent((now) => visited(now, hymn.number)), [recent, hymn.number]);
  return <></>;
}
