/**
 * The player's button on iOS: a native `UIButton` whose title is drawn in
 * the accent on the ground, no fill under it.
 */

import { Button } from 'react-native';

import { useAccent } from '~/color';

import type { AccentButtonProps } from './AccentButton';

export function AccentButton({ title, label, onPress }: AccentButtonProps) {
  const accent = useAccent();
  return <Button title={title} accessibilityLabel={label} color={accent} onPress={onPress} />;
}
