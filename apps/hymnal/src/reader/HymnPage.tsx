/**
 * A hymn's words in the order it is sung: its number and title, the
 * `Chords` switch, then each stanza under its number and the refrain,
 * marked, each time it is sung. The theme's ink on its ground, scaled with
 * the reader's text size.
 *
 * With chords off the page is the words alone and the hymn's chords are not
 * decoded. With chords on, each section is drawn under its chords
 * (`Chords.tsx`) in the key the hymn's own move reaches.
 */

import { useAtom } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { memo, type ReactNode, useMemo } from 'react';
import { ScrollView, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

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
import { color, useAccent } from '~/color';

import { ChordControls, ChordLines, PlayedKeyProvider } from './Chords';

/** What the page reads its chords from: the stored switch, each hymn's move, the bundled chords. */
export interface ChordReader {
  readonly chords: Atom.Writable<boolean>;
  readonly move: (number: number) => Atom.Writable<Move>;
  readonly book: ChordBook;
}

/** The hymn's words, with `children` (its recording's control) under its title. */
export function HymnPage({
  hymn,
  reader,
  children,
}: {
  readonly hymn: HymnText;
  readonly reader: ChordReader;
  readonly children?: ReactNode;
}) {
  const accent = useAccent();
  const [on, setOn] = useAtom(reader.chords);
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
      <View style={styles.head}>
        <Text style={[styles.number, { color: accent }]} dynamicTypeRamp="title2">
          {hymn.number}
        </Text>
        <Text role="heading" aria-level={1} style={styles.title} dynamicTypeRamp="title2">
          {hymn.title}
        </Text>
      </View>
      <ChordControls on={on} onChange={setOn} printed={printed} move={move} onMove={setMove} />
      {children}
      <PlayedKeyProvider value={played}>
        <Sections hymn={hymn} chords={chords} />
      </PlayedKeyProvider>
    </ScrollView>
  );
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
  return lines.map((line, k) => (
    <Text key={k} style={style} dynamicTypeRamp="body">
      {line}
    </Text>
  ));
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
  head: { gap: 2 },
  number: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, fontWeight: '700', color: color.ink },
  section: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: color.muted },
  refrain: { paddingLeft: 16 },
  line: { fontSize: 17, lineHeight: 24, color: color.ink },
  refrainLine: { fontStyle: 'italic' },
});

const refrainStyle = [styles.line, styles.refrainLine];
