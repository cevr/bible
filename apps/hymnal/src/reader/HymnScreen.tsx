/**
 * The hymn route's screen, pushed over the home screen from its list or its
 * search. The native header names the hymn.
 */

import { Option } from 'effect';
import { Stack, useParams } from 'one';
import bundled from 'virtual:hymnal-chords';

import { chordBook } from '~/hymns/chords';
import { hymnAt, hymns } from '~/hymns/hymns';
import { PlayerControl } from '~/player/PlayerControl';
import { pushedOptions } from '~/stack';
import { settings } from '~/store';

import { type ChordReader, HymnPage, NoHymn } from './HymnPage';

/** The page's chords: the stored switch and moves, and every hymn's chords, each decoded on first view. */
const reader: ChordReader = {
  chords: settings.chords,
  move: settings.move,
  book: chordBook(bundled),
};

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
        <Stack.Screen options={{ ...pushedOptions, title: hymn.title }} />
        <HymnPage hymn={hymn} reader={reader}>
          <PlayerControl track={hymn} />
        </HymnPage>
      </>
    ),
  });
}
