/**
 * A player bar button's mark beyond iOS, drawn with Views in a 22-point
 * box, in `tint`: a speaker with two waves while sound is on, with a slash
 * across it while it is off; a play triangle, two pause bars, and a ring
 * with an arrowhead, turning clockwise for retry and counter-clockwise for
 * again.
 */

import { Match } from 'effect';
import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';

import type { Mark } from './button';

export function BarMark({ mark, tint }: { readonly mark: Mark; readonly tint: ColorValue }) {
  return (
    <View aria-hidden testID={`mark-${mark}`} style={styles.mark}>
      {drawingOf(mark, tint)}
    </View>
  );
}

const speaker = (tint: ColorValue): ReactNode => [
  <View key="body" style={[styles.body, { backgroundColor: tint }]} />,
  <View key="cone" style={[styles.cone, { borderRightColor: tint }]} />,
];

const turn = (tint: ColorValue, flip: boolean): ReactNode => (
  <View style={[styles.mark, flip && styles.flip]}>
    <View style={[styles.ring, { borderColor: tint, borderTopColor: 'transparent' }]} />
    <View style={[styles.head, { borderLeftColor: tint }]} />
  </View>
);

const drawingOf = (mark: Mark, tint: ColorValue): ReactNode =>
  Match.value(mark).pipe(
    Match.when('sound-on', () => [
      speaker(tint),
      <View key="near" style={[styles.near, { borderRightColor: tint }]} />,
      <View key="far" style={[styles.far, { borderRightColor: tint }]} />,
    ]),
    Match.when('sound-off', () => [
      speaker(tint),
      <View key="slash" style={[styles.slash, { backgroundColor: tint }]} />,
    ]),
    Match.when('play', () => <View style={[styles.play, { borderLeftColor: tint }]} />),
    Match.when('pause', () => [
      <View key="l" style={[styles.bar, styles.barLeft, { backgroundColor: tint }]} />,
      <View key="r" style={[styles.bar, styles.barRight, { backgroundColor: tint }]} />,
    ]),
    Match.when('retry', () => turn(tint, false)),
    Match.when('again', () => turn(tint, true)),
    Match.exhaustive,
  );

const styles = StyleSheet.create({
  mark: { width: 22, height: 22 },
  flip: { transform: [{ scaleX: -1 }] },
  body: { position: 'absolute', left: 1, top: 8, width: 5, height: 6, borderRadius: 1 },
  cone: {
    position: 'absolute',
    left: 2,
    top: 4,
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderRightWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  near: {
    position: 'absolute',
    left: 9,
    top: 7,
    width: 6,
    height: 8,
    borderRightWidth: 2,
    borderRadius: 4,
  },
  far: {
    position: 'absolute',
    left: 10,
    top: 3,
    width: 10,
    height: 16,
    borderRightWidth: 2,
    borderRadius: 8,
  },
  slash: {
    position: 'absolute',
    left: 10,
    top: -1,
    width: 2,
    height: 24,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  play: {
    position: 'absolute',
    left: 5,
    top: 2,
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  bar: { position: 'absolute', top: 3, width: 5, height: 16, borderRadius: 1 },
  barLeft: { left: 4 },
  barRight: { left: 13 },
  ring: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 16,
    height: 16,
    borderWidth: 2,
    borderRadius: 8,
    transform: [{ rotate: '45deg' }],
  },
  head: {
    position: 'absolute',
    left: 14,
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
});
