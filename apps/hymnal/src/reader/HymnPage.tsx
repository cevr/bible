/**
 * A hymn's words in the order it is sung: its number and title, then each
 * stanza under its number and the refrain, marked, each time it is sung.
 * Plain system text on the system background, scaled with the reader's text
 * size.
 */

import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import type { HymnText, Section } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

export function HymnPage({ hymn }: { readonly hymn: HymnText }) {
  const accent = useAccent();
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
      {hymn.sections.map((section, k) => (
        <SectionView key={k} section={section} />
      ))}
    </ScrollView>
  );
}

function SectionView({ section }: { readonly section: Section }) {
  if (section.kind === 'refrain') {
    return (
      <Block name="Refrain" label="Refrain">
        <View style={styles.refrain}>
          <Lines lines={section.lines} style={[styles.line, styles.refrainLine]} />
        </View>
      </Block>
    );
  }
  return (
    <Block name={`Stanza ${section.n}`} label={String(section.n)}>
      <View>
        <Lines lines={section.lines} style={styles.line} />
      </View>
    </Block>
  );
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
  title: { fontSize: 22, fontWeight: '700', color: color.label },
  section: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: color.secondaryLabel },
  refrain: { paddingLeft: 16 },
  line: { fontSize: 17, lineHeight: 24, color: color.label },
  refrainLine: { fontStyle: 'italic' },
});
