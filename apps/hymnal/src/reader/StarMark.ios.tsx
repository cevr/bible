/** The Favourite button's mark on iOS: the SF Symbol `star`, filled while the hymn is a favourite, in the accent. */

import { Match } from 'effect';
import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

export function StarMark({ on }: { readonly on: boolean }) {
  const accent = useAccent();
  return (
    <One.iOS.Image
      systemName={symbolOf(on)}
      swiftStyle={{ foregroundStyle: accent, imageScale: 'large' }}
      style={styles.mark}
    />
  );
}

const symbolOf = Match.type<boolean>().pipe(
  Match.when(true, () => 'star.fill' as const),
  Match.orElse(() => 'star' as const),
);

const styles = StyleSheet.create({ mark: { width: 28, height: 28 } });
