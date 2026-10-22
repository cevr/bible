/** The chords button's mark on iOS: the SF Symbol `guitars`, filled while chords are on, in the accent. */

import { Match } from 'effect';
import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

export function GuitarHead({ on }: { readonly on: boolean }) {
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
  Match.when(true, () => 'guitars.fill' as const),
  Match.orElse(() => 'guitars' as const),
);

const styles = StyleSheet.create({ mark: { width: 28, height: 28 } });
