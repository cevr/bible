import { useAtom } from '@effect/atom-react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Appearance } from '~/settings';
import { settings } from '~/store';
import { color, useAccent } from '~/color';

const choices: ReadonlyArray<{ readonly value: Appearance; readonly label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const [appearance, setAppearance] = useAtom(settings.appearance);
  const accent = useAccent();
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
        Appearance
      </Text>
      <View role="radiogroup" aria-label="Appearance" style={styles.group}>
        {choices.map(({ value, label }, k) => (
          <Pressable
            key={value}
            role="radio"
            aria-checked={appearance === value}
            onPress={() => setAppearance(value)}
            style={({ pressed }) => [
              styles.row,
              k > 0 && styles.divided,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.label} dynamicTypeRamp="body">
              {label}
            </Text>
            <Text style={[styles.check, { color: accent }]} aria-hidden>
              {appearance === value && '✓'}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8 },
  heading: {
    marginLeft: 16,
    fontSize: 13,
    color: color.secondaryLabel,
    textTransform: 'uppercase',
  },
  group: { borderRadius: 12, overflow: 'hidden', backgroundColor: color.grouped },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
  pressed: { backgroundColor: color.separator },
  label: { flex: 1, fontSize: 17, color: color.label },
  check: { fontSize: 17, fontWeight: '600' },
});
