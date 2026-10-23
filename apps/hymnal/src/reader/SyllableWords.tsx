/**
 * A sung line drawn as its syllables, chords on or off: a row of words that
 * wraps between words, each word a row of its syllables that stays together,
 * with a muted hyphen between the syllables of one word. The row is indented
 * and its first word pulled back to the line's start, so a wrapped line hangs
 * (`HangingLine` does the same for a Plain part's words).
 *
 * With chords off (and under a line-level part's chord row), the words sit
 * a space apart, as the page's words do. Under syllable-level chords, each
 * syllable is a box with its chords over it (`over`), the words a fixed gap
 * apart; a box widened by a long chord stretches the hyphen in its word.
 *
 * Unboxed, the row is one accessible element that reads the whole line as
 * words (`label`); the syllables and hyphens are not read on their own.
 * Boxed, the row is not one element, so each chord keeps its own id on iOS
 * (`chord-p-l-s`) and each syllable is read under its chords. While the
 * line is sung (`follow/`), it is `selected`, its syllables take the muted
 * colour and the sung syllable the accent: a change of colour only, so
 * nothing moves.
 */

import { Option } from 'effect';
import type { ReactNode } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import { color } from '~/color';
import type { Box, Word } from '~/hymns/chords';

import { currentOf } from '~/follow/current';
import { useLineFollow } from '~/follow/follow';

import { usePageText } from './pageText';

export function SyllableLine({
  words,
  label,
  at,
  index,
  style,
  over,
}: {
  readonly words: ReadonlyArray<Word>;
  /** The line's words as printed: what a screen reader reads. */
  readonly label: string;
  /** The line's place, `p-l`: its syllables are `syllable-p-l-s`. */
  readonly at: string;
  /** The line's place in the hymn as sung, from 0: its mark in the follow. */
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
  /** What sits over each syllable, its place `p-l-s` given: its chords, when the line is boxed. */
  readonly over: Option.Option<(box: Box, place: string) => ReactNode>;
}) {
  const { fontScale } = useWindowDimensions();
  const text = usePageText();
  const { marked, ref, syllableStyle } = useLineFollow(index);
  const starts = wordStarts(words);
  const boxed = Option.isSome(over);
  return (
    <View
      ref={ref}
      {...readAs(boxed, label)}
      aria-selected={marked}
      {...currentOf(marked)}
      testID="line"
      style={[
        styles.line,
        boxed && [styles.boxed, { columnGap: 5 * fontScale }],
        { paddingLeft: text.indent },
      ]}
    >
      {words.map((word, w) => (
        <View key={w} style={[styles.word, w === 0 && { marginLeft: -text.indent }]}>
          {word.map((box, k) => {
            const s = (starts[w] ?? 0) + k;
            const place = `${at}-${s + 1}`;
            return (
              <View key={k} style={styles.box}>
                {Option.match(over, { onNone: () => [], onSome: (draw) => draw(box, place) })}
                <View style={styles.syllable}>
                  <Text
                    testID={`syllable-${place}`}
                    style={[style, text.words, syllableStyle(s)]}
                    dynamicTypeRamp="body"
                  >
                    {box.text}
                  </Text>
                  {k < word.length - 1 && (
                    <View style={styles.hyphen} aria-hidden>
                      <Text style={[style, text.words, styles.muted]} dynamicTypeRamp="body">
                        -
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
          {!boxed && w < words.length - 1 && (
            <Text style={[style, text.words]} dynamicTypeRamp="body" aria-hidden>
              {' '}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** An unboxed line is one element read by its words; a boxed one leaves its chords their own ids. */
const readAs = (boxed: boolean, label: string) => {
  if (boxed) return { accessible: false };
  return { accessible: true, 'aria-label': label };
};

/** Each word's first syllable's place in its line, from 0. */
const wordStarts = (words: ReadonlyArray<Word>): ReadonlyArray<number> =>
  words.reduce<Array<number>>(
    (starts, word, w) => [...starts, (starts[w - 1] ?? 0) + (words[w - 1]?.length ?? 0)],
    [],
  );

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap' },
  boxed: { rowGap: 6, marginBottom: 8 },
  word: { flexDirection: 'row' },
  box: { flexDirection: 'column' },
  syllable: { flexDirection: 'row' },
  // The hyphen keeps its own width and takes what a long chord adds to its box.
  hyphen: { flexGrow: 1, alignItems: 'center' },
  muted: { color: color.muted },
});
