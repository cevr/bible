/**
 * The hymn route's screen on the web, pushed over the home screen from its
 * list or its search: one hymn per route. The stack's header names the hymn
 * and holds its buttons (`hymnHeader`, set where the stack is laid out).
 */

import { Option } from 'effect';
import { useParams } from 'one';

import { hymnAt } from '~/hymns/hymns';

import { HymnPage, NoHymn } from './HymnPage';
import { reader, Shown } from './screen';

export { hymnParams } from './screen';

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => <NoHymn number={asked} />,
    onSome: (hymn) => (
      <>
        <Shown hymn={hymn} />
        <HymnPage hymn={hymn} reader={reader} />
      </>
    ),
  });
}
