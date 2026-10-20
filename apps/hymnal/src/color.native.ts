/**
 * A phone's colours. On iOS each role is the theme's pair as one dynamic
 * colour (`DynamicColorIOS`), which follows the app's interface style as the
 * appearance setting sets it. Android has no dynamic colour in React Native,
 * so it keeps the system's own colours until the theme ships as night-mode
 * colour resources.
 */

import { Match } from 'effect';
import {
  type ColorValue,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  useColorScheme,
} from 'react-native';

import { type Roles, theme } from './theme';

const dynamic = (role: keyof Roles) =>
  DynamicColorIOS({ light: theme.light[role], dark: theme.dark[role] });

export const color = Platform.select({
  ios: {
    ground: dynamic('ground'),
    ink: dynamic('ink'),
    muted: dynamic('muted'),
    line: dynamic('line'),
    soft: dynamic('soft'),
  },
  // Each a theme attribute that resolves to one colour: React Native reads a
  // resolved attribute's value as the colour, so an attribute that resolves
  // to a colour state list (`textColorPrimary`, `textColorSecondary`) or a
  // drawable (`listDivider`) draws a wrong colour. The theme has no plain
  // colour for secondary text, so it takes the label's.
  default: {
    ground: PlatformColor('?android:attr/colorBackground'),
    ink: PlatformColor('?android:attr/colorForeground'),
    muted: PlatformColor('?android:attr/colorForeground'),
    line: PlatformColor('?android:attr/colorControlHighlight'),
    soft: PlatformColor('?android:attr/colorControlHighlight'),
  },
}) satisfies Record<Exclude<keyof Roles, 'accent'>, ColorValue>;

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue =>
  Match.value(useColorScheme()).pipe(
    Match.when('dark', () => theme.dark.accent),
    Match.orElse(() => theme.light.accent),
  );

/** The web's CSS: a phone writes none. */
export const webColors = '';
