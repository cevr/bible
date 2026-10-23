import { useAtom } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { About } from '~/about';
import type { ChordStyle } from '~/hymns/simple';
import type { Appearance } from '~/settings';
import { settings } from '~/store';
import { color, useAccent } from '~/color';

interface Choice<A extends string> {
  readonly value: A;
  readonly label: string;
}

const appearances: ReadonlyArray<Choice<Appearance>> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const chordStyles: ReadonlyArray<Choice<ChordStyle>> = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
];

/** Settings, a sheet over the home screen on a phone: it draws its own heading, the sheet no header. */
export default function Settings() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={1} style={styles.title}>
        Settings
      </Text>
      <Heading>Appearance</Heading>
      <Choices label="Appearance" value={settings.appearance} choices={appearances} />
      <Heading>Chords</Heading>
      <Choices label="Chord style" value={settings.chordStyle} choices={chordStyles} />
      <About />
    </ScrollView>
  );
}

function Heading({ children }: { readonly children: string }) {
  return (
    <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
      {children}
    </Text>
  );
}

/** A radio group: one row per choice, the chosen one checked. */
function Choices<A extends string>({
  label,
  value,
  choices,
}: {
  readonly label: string;
  readonly value: Atom.Writable<A>;
  readonly choices: ReadonlyArray<Choice<A>>;
}) {
  const [chosen, choose] = useAtom(value);
  const accent = useAccent();
  return (
    <View role="radiogroup" aria-label={label} style={styles.group}>
      {choices.map((choice, k) => (
        <Pressable
          key={choice.value}
          role="radio"
          aria-label={choice.label}
          aria-checked={chosen === choice.value}
          onPress={() => choose(choice.value)}
          style={({ pressed }) => [styles.row, k > 0 && styles.divided, pressed && styles.pressed]}
        >
          <Text style={styles.label} dynamicTypeRamp="body">
            {choice.label}
          </Text>
          <Text style={[styles.check, { color: accent }]} aria-hidden>
            {chosen === choice.value && '✓'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 24, gap: 8 },
  title: { marginBottom: 8, fontSize: 28, fontWeight: '700', color: color.ink },
  heading: {
    marginLeft: 16,
    fontSize: 13,
    color: color.muted,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  pressed: { backgroundColor: color.soft },
  label: { flex: 1, fontSize: 17, color: color.ink },
  check: { fontSize: 17, fontWeight: '600' },
});
