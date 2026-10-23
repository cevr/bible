/**
 * A printed line of a hymn that hangs when it wraps: its later rows start one
 * indent right of its first, so a wrapped line still reads as one line of the
 * poem. React Native's text has no indent of its own, so the line is a row of
 * its words that wraps between them; the row is indented and its first word
 * pulled back to the line's start. The row is one accessible element that
 * reads the whole line.
 *
 * It draws a line of a Plain part, which carries words and no syllables; a
 * sung line is drawn as its syllables (`SyllableWords.tsx`). While the line
 * is sung (`follow/`), it is `selected` and its words take the muted colour:
 * it has no syllable to light.
 */

import { type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { currentOf } from '~/follow/current';
import { useLineFollow } from '~/follow/follow';
import { WithIntro } from '~/follow/IntroLine';

import { usePageText } from './pageText';

/** Each word of `line` with the space after it; a no-break space, so no row drops it at its end. */
const wordsOf = (line: string): ReadonlyArray<string> => {
  const words = line.split(/ +/).filter((word) => word.length > 0);
  return [...words.slice(0, -1).map((word) => `${word}\u00A0`), ...words.slice(-1)];
};

export function HangingLine({
  line,
  index,
  style,
}: {
  readonly line: string;
  /** The line's place in the hymn as sung, from 0: its mark in the follow. */
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
}) {
  const { words, indent } = usePageText();
  const { marked, ref, wordsStyle } = useLineFollow(index);
  return (
    <WithIntro index={index}>
      <View
        ref={ref}
        accessible
        aria-label={line}
        aria-selected={marked}
        {...currentOf(marked)}
        testID="line"
        style={[styles.row, { paddingLeft: indent }]}
      >
        {wordsOf(line).map((word, k) => (
          <Text
            key={k}
            style={[style, words, k === 0 && { marginLeft: -indent }, wordsStyle]}
            dynamicTypeRamp="body"
          >
            {word}
          </Text>
        ))}
      </View>
    </WithIntro>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap' } });
