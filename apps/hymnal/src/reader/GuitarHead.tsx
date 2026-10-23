/**
 * The chords button's mark, the same on every platform: an acoustic guitar's
 * head, a headstock with three tuning pegs on each side over the top of the
 * neck, drawn in the accent. The headstock is filled while chords are on and
 * outlined while they are off.
 */

import { StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';

/** Each peg pair's distance from the mark's top, in points. */
const pegs = [4, 9, 14] as const;

export function GuitarHead({ on }: { readonly on: boolean }) {
  const accent = useAccent();
  const ink = { backgroundColor: accent };
  return (
    <View aria-hidden testID="guitar-head" style={styles.mark}>
      {pegs.flatMap((top) => [
        <View key={`l${top}`} style={[styles.peg, styles.left, { top }, ink]} />,
        <View key={`r${top}`} style={[styles.peg, styles.right, { top }, ink]} />,
      ])}
      <View style={[styles.head, { borderColor: accent }, on && ink]} />
      <View style={[styles.neck, ink]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: 28, height: 28 },
  head: {
    position: 'absolute',
    top: 2,
    left: 9,
    width: 10,
    height: 16,
    borderWidth: 2,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: color.ground,
  },
  neck: { position: 'absolute', top: 18, left: 12, width: 4, height: 9 },
  peg: { position: 'absolute', width: 5, height: 3, borderRadius: 1.5 },
  left: { left: 4 },
  right: { left: 19 },
});
