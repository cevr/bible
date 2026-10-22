/**
 * The reading sheet, opened by the hymn page's `Aa` button: the words' size
 * in steps, their font, the space between lines, and whether the screen
 * stays on while a hymn is shown. Each choice is kept under its `reading.*`
 * key and the page behind the sheet follows it at once.
 */

import { useAtom } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
} from 'react-native';

import type { ReadingSettings } from '~/settings';
import { color, useAccent } from '~/color';

import { pageTextOf } from './pageText';
import {
  DEFAULT_SIZE,
  defaultReading,
  type Font,
  larger,
  pointsAt,
  readingStyle,
  SIZES,
  smaller,
  type Spacing,
} from './reading';

export function ReadingSheet({ reading }: { readonly reading: ReadingSettings }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={1} style={styles.title}>
        Reading
      </Text>
      <TextSize size={reading.size} />
      <Heading>Font</Heading>
      <Choices label="Font" value={reading.font} choices={fonts} />
      <Heading>Line spacing</Heading>
      <Choices label="Line spacing" value={reading.spacing} choices={spacings} />
      <Awake awake={reading.awake} />
    </ScrollView>
  );
}

/** Each font, its name drawn in its own face. */
const fonts: ReadonlyArray<Choice<Font>> = [
  { value: 'system', label: 'System', style: {} },
  {
    value: 'serif',
    label: 'Serif',
    style: pageTextOf(readingStyle({ ...defaultReading, font: 'serif' }, 1)).words,
  },
];

const spacings: ReadonlyArray<Choice<Spacing>> = [
  { value: 'compact', label: 'Compact', style: {} },
  { value: 'normal', label: 'Normal', style: {} },
  { value: 'roomy', label: 'Roomy', style: {} },
];

/** The size as a share of the page's first size: 100% as it has always been. */
const shareOf = (size: number) =>
  `${Math.round((pointsAt(size) / (SIZES[DEFAULT_SIZE] ?? 17)) * 100)}%`;

function TextSize({ size }: { readonly size: Atom.Writable<number> }) {
  const [step, setStep] = useAtom(size);
  return (
    <View style={[styles.group, styles.sizes]}>
      <Step
        label="Smaller text"
        glyphStyle={styles.smallGlyph}
        disabled={step === smaller(step)}
        onPress={() => setStep(smaller(step))}
      />
      <Text style={styles.share} aria-label={`Text size ${shareOf(step)}`}>
        {shareOf(step)}
      </Text>
      <Step
        label="Larger text"
        glyphStyle={styles.largeGlyph}
        disabled={step === larger(step)}
        onPress={() => setStep(larger(step))}
      />
    </View>
  );
}

function Step({
  label,
  glyphStyle,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly glyphStyle: TextStyle;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const accent = useAccent();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.off]}
    >
      <Text aria-hidden style={[glyphStyle, { color: accent }]}>
        A
      </Text>
    </Pressable>
  );
}

function Heading({ children }: { readonly children: string }) {
  return (
    <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
      {children}
    </Text>
  );
}

interface Choice<A extends string> {
  readonly value: A;
  readonly label: string;
  readonly style: TextStyle;
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
          <Text style={[styles.label, choice.style, styles.labelSize]} dynamicTypeRamp="body">
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

function Awake({ awake }: { readonly awake: Atom.Writable<boolean> }) {
  const [on, setOn] = useAtom(awake);
  return (
    <View style={[styles.group, styles.row, styles.awake]}>
      <Text style={styles.label} dynamicTypeRamp="body" aria-hidden>
        Keep screen on
      </Text>
      <Switch aria-label="Keep screen on" value={on} onValueChange={setOn} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 24, gap: 8 },
  title: { marginBottom: 8, fontSize: 28, fontWeight: '700', color: color.ink },
  heading: {
    marginTop: 8,
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
  sizes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  smallGlyph: { fontSize: 15, fontWeight: '600' },
  largeGlyph: { fontSize: 24, fontWeight: '600' },
  share: { fontSize: 15, color: color.muted, fontVariant: ['tabular-nums'] },
  off: { opacity: 0.35 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  awake: { marginTop: 16, paddingVertical: 6 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  pressed: { backgroundColor: color.soft },
  label: { flex: 1, fontSize: 17, color: color.ink },
  labelSize: { fontSize: 17, lineHeight: 22 },
  check: { fontSize: 17, fontWeight: '600' },
});
