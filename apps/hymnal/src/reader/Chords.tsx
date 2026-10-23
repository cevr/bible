/**
 * The chords on a hymn page: the key controls at the page's top while chords
 * are on (a transpose and a capo, kept for the hymn; chords are turned on and
 * off by the header's `ChordsButton`), and each section drawn under its
 * chords.
 *
 * A syllable-level line is a row of words that wraps between words; a word
 * is a row of syllable boxes that stays together; a box is its chords over
 * its syllable, in the body's own font, so a chord sits over the syllable it
 * changes on with no padded spaces. A box widened by a long chord shows a
 * hyphen in the gap inside its word. A line-level part shows each line's
 * chords in one row above the line.
 *
 * The chords are spelled in the key the move reaches, read from a context by
 * each chord's text alone: a tap on a key control redraws the chord texts,
 * never the sections.
 */

import * as Chord from '@bible/hymnal/chord';
import { createContext, memo, use } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import { color, useAccent } from '~/color';
import type { Section } from '~/hymns/hymns';
import {
  type Box,
  keyName,
  type Move,
  type SectionChords,
  type Word,
  capoed,
  playedKey,
  soundingKey,
  transposed,
} from '~/hymns/chords';

import { currentOf } from '~/follow/current';
import { useLineFollow } from '~/follow/follow';

import { HangingLine } from './HangingLine';
import { usePageText } from './pageText';

/** The key the chords are spelled in, as the hymn's move reaches it. */
const PlayedKey = createContext<Chord.Key>({ tonic: 'C', minor: false });

export const PlayedKeyProvider = PlayedKey.Provider;

/**
 * While chords are on: the key controls when the hymn has chords, else a
 * notice that it has none yet. Nothing while chords are off.
 */
export function ChordControls({
  on,
  printed,
  move,
  onMove,
}: {
  readonly on: boolean;
  /** The hymn's printed key; none while chords are off or the hymn has none. */
  readonly printed: Chord.Key | 'none';
  readonly move: Move;
  readonly onMove: (move: Move) => void;
}) {
  if (!on) return <></>;
  if (printed === 'none') {
    return (
      <Text style={styles.notice} dynamicTypeRamp="footnote">
        No chords for this hymn yet.
      </Text>
    );
  }
  return <KeyControls printed={printed} move={move} onMove={onMove} />;
}

/** Transpose, then capo: each a step down, its reading, a step up. */
function KeyControls({
  printed,
  move,
  onMove,
}: {
  readonly printed: Chord.Key;
  readonly move: Move;
  readonly onMove: (move: Move) => void;
}) {
  const capo = capoReading(printed, move);
  return (
    <View style={styles.keys}>
      <Stepper
        down="Transpose down"
        up="Transpose up"
        reading={`Key ${keyName(soundingKey(printed, move))}`}
        onDown={() => onMove(transposed(move, -1))}
        onUp={() => onMove(transposed(move, 1))}
        atBottom={false}
        atTop={false}
      />
      <Stepper
        down="Capo down"
        up="Capo up"
        reading={capo}
        onDown={() => onMove(capoed(move, -1))}
        onUp={() => onMove(capoed(move, 1))}
        atBottom={move.capo === 0}
        atTop={move.capo === 11}
      />
    </View>
  );
}

const capoReading = (printed: Chord.Key, move: Move): string => {
  if (move.capo === 0) return 'No capo';
  return `Capo ${move.capo}, ${keyName(playedKey(printed, move))} shapes`;
};

function Stepper({
  down,
  up,
  reading,
  onDown,
  onUp,
  atBottom,
  atTop,
}: {
  readonly down: string;
  readonly up: string;
  readonly reading: string;
  readonly onDown: () => void;
  readonly onUp: () => void;
  readonly atBottom: boolean;
  readonly atTop: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <Step label={down} glyph="−" onPress={onDown} disabled={atBottom} />
      <Text style={styles.reading} dynamicTypeRamp="subheadline">
        {reading}
      </Text>
      <Step label={up} glyph="+" onPress={onUp} disabled={atTop} />
    </View>
  );
}

function Step({
  label,
  glyph,
  onPress,
  disabled,
}: {
  readonly label: string;
  readonly glyph: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  const accent = useAccent();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.step,
        pressed && styles.stepPressed,
        disabled && styles.stepDisabled,
      ]}
    >
      <Text style={[styles.glyph, { color: accent }]} dynamicTypeRamp="body" aria-hidden>
        {glyph}
      </Text>
    </Pressable>
  );
}

/** A section's lines under their chords; `p` is its place on the page, from 1. */
export const ChordLines = memo(function ChordLines({
  section,
  shown,
  p,
  first,
  style,
}: {
  readonly section: Section;
  readonly shown: Exclude<SectionChords, { readonly _tag: 'Words' }>;
  readonly p: number;
  /** The section's first line's place in the hymn as sung, from 0. */
  readonly first: number;
  readonly style: StyleProp<TextStyle>;
}) {
  if (shown._tag === 'Line') {
    return section.lines.map((line, l) => (
      <View key={l} style={styles.lineLevel}>
        <ChordText chords={shown.lines[l] ?? []} testID={`chords-${p}-${l + 1}`} />
        <HangingLine line={line} index={first + l} style={style} />
      </View>
    ));
  }
  return shown.lines.map((words, l) => (
    <SyllableLine key={l} words={words} at={`${p}-${l + 1}`} index={first + l} style={style} />
  ));
});

/**
 * While the line is sung (`follow/`), it is `selected` and its syllables take
 * the muted colour, the sung word's syllables the accent.
 */
function SyllableLine({
  words,
  at,
  index,
  style,
}: {
  readonly words: ReadonlyArray<Word>;
  /** The line's place, `p-l`. */
  readonly at: string;
  /** The line's place in the hymn as sung, from 0. */
  readonly index: number;
  readonly style: StyleProp<TextStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  const { indent } = usePageText();
  const { marked, ref, wordStyle } = useLineFollow(index);
  const starts = wordStarts(words);
  return (
    <View
      ref={ref}
      testID="line"
      aria-selected={marked}
      {...currentOf(marked)}
      style={[styles.line, { columnGap: 5 * fontScale, paddingLeft: indent }]}
    >
      {words.map((word, w) => (
        <View key={w} style={[styles.word, w === 0 && { marginLeft: -indent }]}>
          {word.map((box, k) => (
            <SyllableBox
              key={k}
              box={box}
              place={`${at}-${(starts[w] ?? 0) + k + 1}`}
              joinsNext={k < word.length - 1}
              style={[style, wordStyle(w)]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Each word's first syllable's place in its line, from 0. */
const wordStarts = (words: ReadonlyArray<Word>): ReadonlyArray<number> =>
  words.reduce<Array<number>>(
    (starts, word, w) => [...starts, (starts[w - 1] ?? 0) + (words[w - 1]?.length ?? 0)],
    [],
  );

function SyllableBox({
  box,
  place,
  joinsNext,
  style,
}: {
  readonly box: Box;
  /** The syllable's place, `p-l-s`: its chords are `chord-p-l-s`, its text `syllable-p-l-s`. */
  readonly place: string;
  readonly joinsNext: boolean;
  readonly style: StyleProp<TextStyle>;
}) {
  const { words } = usePageText();
  return (
    <View style={styles.box}>
      <BoxChords chords={box.chords} id={`chord-${place}`} />
      <View style={styles.syllable}>
        <Text testID={`syllable-${place}`} style={[style, words]} dynamicTypeRamp="body">
          {box.text}
        </Text>
        {joinsNext && (
          <View style={styles.hyphen} aria-hidden>
            <Text style={[style, words, styles.hyphenText]} dynamicTypeRamp="body">
              -
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** A box's chords, or an empty row of the same height so the line keeps one baseline. */
function BoxChords({
  chords,
  id,
}: {
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly id: string;
}) {
  const text = usePageText();
  if (chords.length === 0) {
    return (
      <Text style={[styles.chord, text.chords]} dynamicTypeRamp="subheadline" aria-hidden>
        {'​'}
      </Text>
    );
  }
  return <ChordText chords={chords} testID={id} />;
}

/** Chords in order, spelled in the played key. */
function ChordText({
  chords,
  testID,
}: {
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly testID: string;
}) {
  const key = use(PlayedKey);
  const accent = useAccent();
  const text = usePageText();
  return (
    <Text
      testID={testID}
      style={[styles.chord, text.chords, { color: accent }]}
      dynamicTypeRamp="subheadline"
    >
      {chords.map((chord) => Chord.format(chord, key)).join(' ') || '​'}
    </Text>
  );
}

const styles = StyleSheet.create({
  notice: { fontSize: 13, color: color.muted },
  keys: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  stepPressed: { backgroundColor: color.soft },
  stepDisabled: { opacity: 0.35 },
  glyph: { fontSize: 20, lineHeight: 22, fontWeight: '600' },
  reading: { fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, marginBottom: 8 },
  word: { flexDirection: 'row' },
  box: { flexDirection: 'column' },
  syllable: { flexDirection: 'row' },
  hyphen: { width: 0, flexGrow: 1, overflow: 'hidden', alignItems: 'center' },
  hyphenText: { color: color.muted },
  chord: { fontSize: 15, lineHeight: 20, fontWeight: '600', paddingRight: 6 },
  lineLevel: { marginBottom: 8 },
});
