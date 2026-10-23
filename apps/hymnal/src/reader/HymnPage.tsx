/**
 * A hymn's words in the order it is sung: its topic as a quiet line, its
 * number and title in one row (the number first, the `Favourite` button
 * last), the key controls while
 * chords are on, then each stanza under its number and the refrain, marked,
 * each time it is sung. The theme's ink on its ground, set as the reader
 * chose in the "Aa" sheet (`reading.ts`) and scaled by the system's text
 * size. A printed line that wraps hangs under its first word
 * (`HangingLine`). While the page is shown, the screen stays on if the reader
 * asked for it (`KeepAwake`).
 *
 * With chords off the page is the words alone and the hymn's chords are not
 * decoded. With chords on, each section is drawn under its chords
 * (`Chords.tsx`) in the key the hymn's own move reaches.
 */

import { useAtom, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { memo, type ReactNode, useMemo } from 'react';
import {
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  type ChordBook,
  hasChords,
  type HymnChords,
  type Move,
  playedKey,
  type SectionChords,
  sectionsOf,
} from '~/hymns/chords';
import type { HymnText, Section } from '~/hymns/hymns';
import type { ReadingSettings } from '~/settings';
import { color, useAccent } from '~/color';

import { ChordControls, ChordLines, PlayedKeyProvider } from './Chords';
import { FavouriteButton } from './FavouriteButton';
import { HangingLine } from './HangingLine';
import { KeepAwake } from './KeepAwake';
import { PageTextProvider, pageTextOf } from './pageText';
import { readingStyle } from './reading';

/**
 * What the page reads its chords and its setting from: the stored chords
 * choice, each hymn's move, the bundled chords, the reading settings, and
 * the reader's Favourites.
 */
export interface ChordReader {
  readonly chords: Atom.Writable<boolean>;
  readonly move: (number: number) => Atom.Writable<Move>;
  readonly book: ChordBook;
  readonly reading: ReadingSettings;
  readonly favourites: Atom.Writable<ReadonlyArray<number>>;
}

/** The hymn's words under its number and title. */
export function HymnPage({
  hymn,
  reader,
}: {
  readonly hymn: HymnText;
  readonly reader: ChordReader;
}) {
  const accent = useAccent();
  const on = useAtomValue(reader.chords);
  const [move, setMove] = useAtom(reader.move(hymn.number));
  const chords = useMemo(
    () =>
      Option.some(on).pipe(
        Option.filter(Boolean),
        Option.flatMap(() => reader.book.of(hymn.number)),
        Option.filter(hasChords),
      ),
    [on, reader.book, hymn.number],
  );
  const printed = Option.match(chords, { onNone: () => 'none' as const, onSome: (c) => c.key });
  const played = Option.match(chords, {
    onNone: () => hymnKeyAtRest,
    onSome: (c) => playedKey(c.key, move),
  });
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      <KeepAwake on={reader.reading.awake} />
      <View style={styles.head}>
        <Text testID="hymn-topic" style={styles.topic} dynamicTypeRamp="footnote">
          {hymn.topic}
        </Text>
        <View testID="hymn-name" style={styles.name}>
          <View style={styles.words}>
            <Text
              testID="hymn-number"
              style={[styles.number, { color: accent }]}
              dynamicTypeRamp="title2"
            >
              {hymn.number}
            </Text>
            <Text role="heading" aria-level={1} style={styles.title} dynamicTypeRamp="title2">
              {hymn.title}
            </Text>
          </View>
          <FavouriteButton number={hymn.number} favourites={reader.favourites} />
        </View>
      </View>
      <ChordControls on={on} printed={printed} move={move} onMove={setMove} />
      <PageText reading={reader.reading}>
        <PlayedKeyProvider value={played}>
          <Sections hymn={hymn} chords={chords} />
        </PlayedKeyProvider>
      </PageText>
    </ScrollView>
  );
}

/** Hands the lines the reader's size, font and spacing, under the system's text size. */
function PageText({
  reading,
  children,
}: {
  readonly reading: ReadingSettings;
  readonly children: ReactNode;
}) {
  const size = useAtomValue(reading.size);
  const font = useAtomValue(reading.font);
  const spacing = useAtomValue(reading.spacing);
  const { fontScale } = useWindowDimensions();
  const text = useMemo(
    () => pageTextOf(readingStyle({ size, font, spacing }, fontScale)),
    [size, font, spacing, fontScale],
  );
  return <PageTextProvider value={text}>{children}</PageTextProvider>;
}

/** A section drawn as its words alone. */
const wordsAlone: SectionChords = { _tag: 'Words' };

/** The key chords are spelled in while none are shown. */
const hymnKeyAtRest = { tonic: 'C', minor: false } as const;

/** Every section, as words or under its chords: drawn again only when the chords come or go. */
const Sections = memo(function Sections({
  hymn,
  chords,
}: {
  readonly hymn: HymnText;
  readonly chords: Option.Option<HymnChords>;
}) {
  const shown = useMemo(
    () =>
      Option.match(chords, {
        onNone: () => hymn.sections.map(() => wordsAlone),
        onSome: (c) => sectionsOf(hymn, c),
      }),
    [hymn, chords],
  );
  return hymn.sections.map((section, k) => (
    <SectionView
      key={k}
      section={section}
      shown={Option.getOrElse(Option.fromUndefinedOr(shown[k]), () => wordsAlone)}
      p={k + 1}
    />
  ));
});

function SectionView({
  section,
  shown,
  p,
}: {
  readonly section: Section;
  readonly shown: SectionChords;
  readonly p: number;
}) {
  if (section.kind === 'refrain') {
    return (
      <Block name="Refrain" label="Refrain">
        <View style={styles.refrain}>
          <Body section={section} shown={shown} p={p} style={refrainStyle} />
        </View>
      </Block>
    );
  }
  return (
    <Block name={`Stanza ${section.n}`} label={String(section.n)}>
      <View>
        <Body section={section} shown={shown} p={p} style={styles.line} />
      </View>
    </Block>
  );
}

/** A section's lines: the words alone, or under their chords. */
function Body({
  section,
  shown,
  p,
  style,
}: {
  readonly section: Section;
  readonly shown: SectionChords;
  readonly p: number;
  readonly style: StyleProp<TextStyle>;
}) {
  if (shown._tag === 'Words') return <Lines lines={section.lines} style={style} />;
  return <ChordLines section={section} shown={shown} p={p} style={style} />;
}

/** A section under its label: the stanza's number, or "Refrain". */
function Block({
  name,
  label,
  children,
}: {
  readonly name: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <View role="group" aria-label={name} style={styles.section}>
      <Text
        role="heading"
        aria-level={2}
        aria-label={name}
        style={styles.label}
        dynamicTypeRamp="footnote"
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Lines({
  lines,
  style,
}: {
  readonly lines: ReadonlyArray<string>;
  readonly style: StyleProp<TextStyle>;
}) {
  return lines.map((line, k) => <HangingLine key={k} line={line} style={style} />);
}

export function NoHymn({ number }: { readonly number: string }) {
  return (
    <View style={styles.page}>
      <Text style={styles.line}>No hymn {number}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, gap: 24 },
  head: { gap: 4 },
  topic: { fontSize: 13, color: color.muted },
  // The number and title share a baseline; the Favourite button sits at the
  // row's top, level with their first line.
  name: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  words: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 },
  number: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { flexShrink: 1, fontSize: 22, fontWeight: '700', color: color.ink },
  section: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: color.muted },
  refrain: { paddingLeft: 16 },
  line: { fontSize: 17, lineHeight: 24, color: color.ink },
  refrainLine: { fontStyle: 'italic' },
});

const refrainStyle = [styles.line, styles.refrainLine];
