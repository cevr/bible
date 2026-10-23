/**
 * The hymn route's screen on the web, pushed over the home screen from its
 * list or its search: one hymn per route. The native header names the hymn
 * and holds its buttons (`headerRight`) at its top right.
 */

import { Option } from 'effect';
import { Stack, useParams } from 'one';

import { hymnAt } from '~/hymns/hymns';
import { pushedOptions } from '~/stack';

import { HymnPage, NoHymn } from './HymnPage';
import { headerRight, reader, Shown } from './screen';

export { hymnParams } from './screen';

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
