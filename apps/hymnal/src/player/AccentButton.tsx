/**
 * The player's button on the web and Android: an accent fill with its title
 * in `onAccent`. React Native's `Button` there draws its title white on the
 * colour it is given, which reads at 1.59:1 on the dark accent; this one
 * takes the theme's text on the accent (`theme.test.ts` holds it to AA).
 */

import { Pressable, StyleSheet, Text } from 'react-native';

import { useAccent, useOnAccent } from '~/color';

export interface AccentButtonProps {
  readonly title: string;
  readonly label: string;
  readonly onPress: () => void;
}

export function AccentButton({ title, label, onPress }: AccentButtonProps) {
  const accent = useAccent();
  const onAccent = useOnAccent();
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: accent },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.title, { color: onAccent }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  title: { fontSize: 15, fontWeight: '600' },
});
