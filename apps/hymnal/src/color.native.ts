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

// Each platform's colours are a function, and only the chosen one runs:
// `DynamicColorIOS` throws on Android, and an object literal for iOS would be
// built there too.
export const color = Platform.select({
  ios: () => ({
    ground: dynamic('ground'),
    ink: dynamic('ink'),
    muted: dynamic('muted'),
    line: dynamic('line'),
    soft: dynamic('soft'),
  }),
  // Each a theme attribute that resolves to one colour: React Native reads a
  // resolved attribute's value as the colour, so an attribute that resolves
  // to a colour state list (`textColorPrimary`, `textColorSecondary`) or a
  // drawable (`listDivider`) draws a wrong colour. The theme has no plain
  // colour for secondary text, so it takes the label's.
  default: () => ({
    ground: PlatformColor('?android:attr/colorBackground'),
    ink: PlatformColor('?android:attr/colorForeground'),
    muted: PlatformColor('?android:attr/colorForeground'),
    line: PlatformColor('?android:attr/colorControlHighlight'),
    soft: PlatformColor('?android:attr/colorControlHighlight'),
  }),
})() satisfies Record<Exclude<keyof Roles, Fill>, ColorValue>;

/** The roles a screen reads through a hook: the accent fill and its text, pressed or not. */
type Fill = 'accent' | 'onAccent' | 'pressed' | 'onPressed';

/** The theme's roles in the scheme showing now. */
const useRoles = (): Roles =>
  Match.value(useColorScheme()).pipe(
    Match.when('dark', () => theme.dark),
    Match.orElse(() => theme.light),
  );

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue => useRoles().accent;

/** Text on the accent in the scheme showing now. */
export const useOnAccent = (): ColorValue => useRoles().onAccent;

/** The accent fill while pressed, and its text, in the scheme showing now. */
export const usePressed = () => {
  const roles = useRoles();
  return { fill: roles.pressed, text: roles.onPressed };
};

/** The web's CSS: a phone writes none. */
export const webColors = '';
