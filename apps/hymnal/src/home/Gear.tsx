/** The settings button's mark beyond iOS: a gear glyph, in the accent. */

import { StyleSheet, Text } from 'react-native';

import { useAccent } from '~/color';

export function Gear() {
  const accent = useAccent();
  return (
    <Text style={[styles.gear, { color: accent }]} aria-hidden>
      ⚙︎
    </Text>
  );
}

const styles = StyleSheet.create({ gear: { fontSize: 24, lineHeight: 28 } });
