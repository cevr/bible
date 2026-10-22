/**
 * The chords button's mark beyond iOS: a guitar's head drawn in the accent,
 * a headstock with three tuning pegs each side over the top of the neck,
 * filled while chords are on and outlined while they are off.
 */

import { StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';

const pegs = [3, 8, 13] as const;

export function GuitarHead({ on }: { readonly on: boolean }) {
  const accent = useAccent();
  const ink = { backgroundColor: accent };
  return (
    <View aria-hidden style={styles.mark}>
      {pegs.map((top) => (
        <View key={top} style={[styles.peg, { top }, ink]} />
      ))}
      <View style={[styles.head, { borderColor: accent }, on && ink]} />
      <View style={[styles.neck, ink]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: 28, height: 28, alignItems: 'center' },
  head: {
    marginTop: 1,
    backgroundColor: color.ground,
    width: 12,
    height: 17,
    borderWidth: 2,
    borderRadius: 5,
  },
  neck: { width: 4, height: 9 },
  peg: { position: 'absolute', left: 5, right: 5, height: 2, borderRadius: 1 },
});
