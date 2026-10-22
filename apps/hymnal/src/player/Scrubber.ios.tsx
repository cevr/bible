/**
 * iOS's position bar, drawn here: a track, the part played in the accent,
 * and a thumb. SwiftUI's `Slider` (One's `One.iOS.Slider`) is not used: One
 * builds it with a step, always (it refuses a step of 0), and iOS 26 draws a
 * stepped slider's ticks under its track, which at a second a step read as
 * a stray line. This bar knows the touch that drags it, as the web's does:
 * the place under the finger is the drag, and the drag is sent once the
 * finger lifts. VoiceOver adjusts it ten seconds a swipe. While the length
 * is not known the bar is still, in the muted role.
 */

import { Match } from 'effect';
import { useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  StyleSheet,
  View,
} from 'react-native';

import { color, useAccent } from '~/color';

import { nudged, placeAt, type ScrubberProps, useScrub } from './scrub';

/** The one touch a bar on iOS follows: its responder holds one at a time. */
const TOUCH = 1;

const THUMB = 20;

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  const [width, setWidth] = useState(0);
  const share = placeAt(scrub.value, scrub.max, 1);
  const tint = Match.value(scrub.still).pipe(
    Match.when(true, () => color.muted),
    Match.orElse(() => accent),
  );
  /** The place under the touch, along the track (the thumb's half inset at each end). */
  const under = (event: GestureResponderEvent) =>
    placeAt(event.nativeEvent.locationX - THUMB / 2, width - THUMB, scrub.max);
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'increment') scrub.step(nudged(scrub.value, scrub.max, 1));
    if (nativeEvent.actionName === 'decrement') scrub.step(nudged(scrub.value, scrub.max, -1));
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Position"
      accessibilityValue={{ text: scrub.said }}
      accessibilityState={{ disabled: scrub.still }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={act}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !scrub.still}
      onMoveShouldSetResponder={() => !scrub.still}
      // A drag on the bar is the bar's: the sheet does not take it to pan.
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        scrub.press(TOUCH);
        scrub.move(under(event));
      }}
      onResponderMove={(event) => scrub.move(under(event))}
      onResponderRelease={() => scrub.lift(TOUCH)}
      onResponderTerminate={() => scrub.drop(TOUCH)}
      style={styles.bar}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.played, { width: `${share * 100}%`, backgroundColor: tint }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: share * Math.max(width - THUMB, 0), backgroundColor: tint }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 32, justifyContent: 'center' },
  track: {
    marginHorizontal: THUMB / 2,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: color.line,
  },
  played: { height: 4 },
  thumb: { position: 'absolute', top: 6, width: THUMB, height: THUMB, borderRadius: THUMB / 2 },
});
