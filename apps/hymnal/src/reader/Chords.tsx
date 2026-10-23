/**
 * The chords on a hymn page: the key controls at the page's top while chords
 * are on (a transpose and a capo, kept for the hymn; chords are turned on and
 * off by the header's `ChordsButton`), and each section drawn under its
 * chords.
 *
 * A syllable-level line is its syllables (`SyllableWords.tsx`), each a box
 * with its chords over it, in the body's own font, so a chord sits over the
 * syllable it changes on with no padded spaces. A line-level part shows each
 * line's chords in one row above the line's syllables.
 *
 * The chords are spelled in the key the move reaches, read from a context by
 * each chord's text alone: a tap on a key control redraws the chord texts,
 * never the sections.
 */

import * as Chord from '@bible/hymnal/chord';
import { Option } from 'effect';
import { createContext, memo, use } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

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

import { SyllableLine } from './SyllableWords';
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

/**
 * A section's lines under their chords; `p` is its place on the page, from 1.
 * A syllable-level line is its syllables, each under its chords; a
 * line-level line is a row of its chords over its syllables (`syllables`,
 * the same part's syllables without chords).
 */
export const ChordLines = memo(function ChordLines({
  section,
  shown,
  syllables,
  p,
  first,
  style,
}: {
  readonly section: Section;
  readonly shown: Exclude<SectionChords, { readonly _tag: 'Words' }>;
  /** Each line's words as syllables. */
  readonly syllables: ReadonlyArray<ReadonlyArray<Word>>;
  readonly p: number;
  /** The section's first line's place in the hymn as sung, from 0. */
  readonly first: number;
  readonly style: StyleProp<TextStyle>;
}) {
  if (shown._tag === 'Line') {
    return section.lines.map((line, l) => (
      <View key={l} style={styles.lineLevel}>
        <ChordText chords={shown.lines[l] ?? []} testID={`chords-${p}-${l + 1}`} />
        <SyllableLine
          words={syllables[l] ?? []}
          label={line}
          at={`${p}-${l + 1}`}
          index={first + l}
          style={style}
          over={Option.none()}
        />
      </View>
    ));
  }
  return shown.lines.map((words, l) => (
    <SyllableLine
      key={l}
      words={words}
      label={section.lines[l] ?? ''}
      at={`${p}-${l + 1}`}
      index={first + l}
      style={style}
      over={Option.some(boxChords)}
    />
  ));
});

/** A syllable box's chords, `chord-p-l-s`. */
const boxChords = (box: Box, place: string) => (
  <BoxChords chords={box.chords} id={`chord-${place}`} />
);

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
  chord: { fontSize: 15, lineHeight: 20, fontWeight: '600', paddingRight: 6 },
  lineLevel: { marginBottom: 8 },
});
