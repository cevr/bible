/**
 * The intro over a hymn's first sung line: while the recording plays before
 * the first line (`intro.ts`), a thin accent line over a hairline fills
 * from the share played to full at the first line, linearly, and holds
 * while paused or waiting. It is gone from the first line on, when line 0 is
 * marked.
 *
 * It is drawn absolutely just above line 0, as the element after it in a
 * box the two share, so the page never moves when it comes or goes. It is
 * beside the line, not in it (an accessible line hides the elements inside
 * it on iOS), and its parent box has the line's height: under a box of no
 * height, iOS leaves it out of the accessibility tree. It is an accessible
 * element of its own and reads as a progress bar named `Introduction`:
 * whole percent played, and whole seconds to the first line.
 */

import { Option } from 'effect';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';

import { useIntro } from './follow';
import { type Intro as Shown, readingOf } from './intro';

/**
 * Line `index` of the page, with the intro over it when it is line 0: the
 * two share a box of their own, so the section's gap between its rows is
 * the same whether the intro shows or not.
 */
export function WithIntro({
  index,
  children,
}: {
  readonly index: number;
  readonly children: ReactNode;
}) {
  if (index !== 0) return children;
  return (
    <View>
      {children}
      <Intro />
    </View>
  );
}

function Intro() {
  const { intro, running } = useIntro();
  return Option.match(intro, {
    onNone: () => <></>,
    onSome: (shown) => <Fill intro={shown} running={running} />,
  });
}

function Fill({ intro, running }: { readonly intro: Shown; readonly running: boolean }) {
  const accent = useAccent();
  const fill = useRef(new Animated.Value(intro.share)).current;
  useEffect(() => {
    fill.setValue(intro.share);
    if (!running) return () => {};
    const run = Animated.timing(fill, {
      toValue: 1,
      duration: intro.left,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    });
    run.start();
    return () => run.stop();
  }, [fill, intro.share, intro.left, running]);
  const reading = readingOf(intro);
  return (
    <View
      accessible
      role="progressbar"
      aria-label="Introduction"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={reading.now}
      aria-valuetext={reading.text}
      testID="intro"
      style={styles.track}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: accent, transform: [{ scaleX: fill }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -5,
    height: 2,
    backgroundColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: 2, width: '100%', transformOrigin: 'left' },
});
