/** The Favourite button's mark beyond iOS: a star in the accent, filled while the hymn is a favourite. */

import { Match } from 'effect';
import { StyleSheet, Text } from 'react-native';

import { useAccent } from '~/color';

export function StarMark({ on }: { readonly on: boolean }) {
  const accent = useAccent();
  return (
    <Text aria-hidden style={[styles.mark, { color: accent }]}>
      {starOf(on)}
    </Text>
  );
}

const starOf = Match.type<boolean>().pipe(
  Match.when(true, () => '★'),
  Match.orElse(() => '☆'),
);

const styles = StyleSheet.create({ mark: { fontSize: 24, lineHeight: 28 } });
