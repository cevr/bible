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
  default: {
    label: PlatformColor('?android:attr/textColorPrimary'),
    secondaryLabel: PlatformColor('?android:attr/textColorSecondary'),
    background: PlatformColor('?android:attr/colorBackground'),
    separator: PlatformColor('?android:attr/listDivider'),
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
