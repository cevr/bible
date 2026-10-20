/**
 * The hymn route's screen, shared by the Hymns and Search tabs so a hymn
 * opens in the tab it was found in. The native header names the hymn.
 */

import { Option } from 'effect';
import { Stack, useParams } from 'one';

import { hymnAt, hymns } from '~/hymns/hymns';

import { HymnPage, NoHymn } from './HymnPage';

/** Every hymn's page is rendered when the web is built. */
export const hymnParams = () => hymns.map((hymn) => ({ number: String(hymn.number) }));

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => (
      <>
        <Stack.Screen options={{ title: `No hymn ${asked}` }} />
        <NoHymn number={asked} />
      </>
    ),
    onSome: (hymn) => (
      <>
        <Stack.Screen options={{ title: hymn.title }} />
        <HymnPage hymn={hymn} />
      </>
    ),
  });
}
