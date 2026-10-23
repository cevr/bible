/**
 * The hymn route's screen on the web, pushed over the home screen from its
 * list or its search: one hymn per route. The stack's header names the hymn
 * and holds its buttons (`hymnHeader`, set where the stack is laid out).
 * While the player holds no hymn the page draws the bottom bar as its own
 * (`PageBar`), under its words.
 */

import { Option } from 'effect';
import { useParams } from 'one';
import { StyleSheet, View } from 'react-native';

import { hymnAt } from '~/hymns/hymns';
import { PageBar } from '~/player/PlayerBar';

import { HymnPage, NoHymn } from './HymnPage';
import { reader, Shown } from './screen';

export { hymnParams } from './screen';

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => <NoHymn number={asked} />,
    onSome: (hymn) => (
      <View style={styles.screen}>
        <Shown hymn={hymn} />
        <View style={styles.words}>
          <HymnPage hymn={hymn} reader={reader} />
        </View>
        <PageBar track={hymn} />
      </View>
    ),
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  words: { flex: 1, minHeight: 0 },
});
