/** The reading button's mark beyond iOS: "Aa" in the accent, a small A beside a large one. */

import { StyleSheet, Text } from 'react-native';

import { useAccent } from '~/color';

export function TextMark() {
  const accent = useAccent();
  return (
    <Text aria-hidden style={[styles.mark, { color: accent }]}>
      <Text style={styles.small}>A</Text>a
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { fontSize: 20, fontWeight: '600' },
  small: { fontSize: 15 },
});
