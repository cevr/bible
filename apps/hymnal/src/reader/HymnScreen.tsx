/**
 * The hymn route's screen, pushed over the home screen from its list or its
 * search. The native header names the hymn and holds its buttons
 * (`HeaderButtons`) at its top right.
 */

import { Option } from 'effect';
import { Stack, useParams } from 'one';
import bundled from 'virtual:hymnal-chords';

import { chordBook } from '~/hymns/chords';
import { hymnAt, hymns } from '~/hymns/hymns';
import { useShowsPage } from '~/player/page';
import type { Track } from '~/player/player';
import { pushedOptions } from '~/stack';
import { settings } from '~/store';

import { ChordsButton, HeaderButtons, ReadingButton } from './HeaderButtons';
import { type ChordReader, HymnPage, NoHymn } from './HymnPage';

/** The page's chords: the stored switch and moves, and every hymn's chords, each decoded on first view; and how the page is set. */
const reader: ChordReader = {
  chords: settings.chords,
  move: settings.move,
  book: chordBook(bundled),
  reading: settings.reading,
};

/** The header's buttons on every hymn's page. */
const headerRight = () => (
  <HeaderButtons>
    <ReadingButton />
    <ChordsButton chords={reader.chords} />
  </HeaderButtons>
);

/** Every hymn's page is rendered when the web is built. */
export const hymnParams = () => hymns.map((hymn) => ({ number: String(hymn.number) }));

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => (
      <>
        <Stack.Screen options={{ ...pushedOptions, title: `No hymn ${asked}` }} />
        <NoHymn number={asked} />
      </>
    ),
    onSome: (hymn) => (
      <>
        <Stack.Screen options={{ ...pushedOptions, title: hymn.title, headerRight }} />
        <Shown hymn={hymn} />
        <HymnPage hymn={hymn} reader={reader} />
      </>
    ),
  });
}

/** Tells the bottom bar this hymn's page is shown, for as long as it is. */
function Shown({ hymn }: { readonly hymn: Track }) {
  useShowsPage(hymn);
  return <></>;
}
