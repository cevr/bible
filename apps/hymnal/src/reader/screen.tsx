/**
 * What the hymn route's screen is made of on every platform: the page's
 * chord reader, the header's buttons, the hymns the web builds a page for,
 * and the mark that tells the bottom bar which hymn's page is shown. The web
 * shows one hymn per route (`HymnScreen.tsx`); a phone swipes between hymns
 * (`HymnScreen.native.tsx`).
 */

import bundled from 'virtual:hymnal-chords';

import { chordBook } from '~/hymns/chords';
import { hymns } from '~/hymns/hymns';
import { useShowsPage } from '~/player/page';
import type { Track } from '~/player/player';
import { settings } from '~/store';

import { ChordsButton, HeaderButtons, ReadingButton } from './HeaderButtons';
import type { ChordReader } from './HymnPage';

/** The page's chords: the stored switch and moves, and every hymn's chords, each decoded on first view; and how the page is set. */
export const reader: ChordReader = {
  chords: settings.chords,
  move: settings.move,
  book: chordBook(bundled),
  reading: settings.reading,
};

/** The header's buttons on every hymn's page. */
export const headerRight = () => (
  <HeaderButtons>
    <ReadingButton />
    <ChordsButton chords={reader.chords} />
  </HeaderButtons>
);

/** Every hymn's page is rendered when the web is built. */
export const hymnParams = () => hymns.map((hymn) => ({ number: String(hymn.number) }));

/** Tells the bottom bar this hymn's page is shown, for as long as it is. */
export function Shown({ hymn }: { readonly hymn: Track }) {
  useShowsPage(hymn);
  return <></>;
}
