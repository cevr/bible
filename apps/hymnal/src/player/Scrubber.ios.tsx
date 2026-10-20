/**
 * iOS's position bar: SwiftUI's `Slider` (One's `One.iOS.Slider`), tinted
 * the accent. The slider tells each value as the reader drags but not when
 * the drag ends, so a drag seeks once it has rested for `rest`.
 */

import { Duration, Option } from 'effect';
import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

import { type ScrubberProps, useCommitAtRest, useScrub } from './scrub';

const rest = Duration.millis(300);

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  useCommitAtRest(scrub, rest);
  return (
    <One.iOS.Slider
      label="Position"
      accessibilityValue={{ text: scrub.said }}
      value={scrub.value}
      onValueChange={scrub.change}
      minimumValue={0}
      // SwiftUI's slider needs a range: a length not yet known draws a still bar.
      maximumValue={Option.getOrElse(
        Option.liftPredicate(scrub.max, (max) => max > 0),
        () => 1,
      )}
      // A second a step. iOS 26 draws a stepped slider's ticks, a faint line
      // under the bar; One's slider has no form without a step.
      step={1}
      disabled={scrub.still}
      swiftStyle={{ tint: accent }}
      style={styles.slider}
    />
  );
}

const styles = StyleSheet.create({ slider: { height: 32 } });
