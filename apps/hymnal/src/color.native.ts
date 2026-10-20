/**
 * A phone's colours: the system's own (`PlatformColor`), which follow the
 * app's interface style as the appearance setting sets it.
 */

import { Match } from 'effect';
import { type ColorValue, Platform, PlatformColor, useColorScheme } from 'react-native';

import { accent } from './theme';

export const color = Platform.select({
  ios: {
    label: PlatformColor('label'),
    secondaryLabel: PlatformColor('secondaryLabel'),
    background: PlatformColor('systemBackground'),
    separator: PlatformColor('separator'),
    grouped: PlatformColor('secondarySystemBackground'),
  },
  // Each a theme attribute that resolves to one colour: React Native reads a
  // resolved attribute's value as the colour, so an attribute that resolves
  // to a colour state list (`textColorPrimary`, `textColorSecondary`) or a
  // drawable (`listDivider`) draws a wrong colour. The theme has no plain
  // colour for secondary text, so it takes the label's.
  default: {
    label: PlatformColor('?android:attr/colorForeground'),
    secondaryLabel: PlatformColor('?android:attr/colorForeground'),
    background: PlatformColor('?android:attr/colorBackground'),
    separator: PlatformColor('?android:attr/colorControlHighlight'),
    grouped: PlatformColor('?android:attr/colorBackgroundFloating'),
  },
}) satisfies Record<string, ColorValue>;

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue =>
  Match.value(useColorScheme()).pipe(
    Match.when('dark', () => accent.dark),
    Match.orElse(() => accent.light),
  );

/** The web's CSS: a phone writes none. */
export const webColors = '';
