/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a script at Bun's boundary: its loader takes the stand-in module as source text, and the colour module is imported only once the stand-in is registered. */

/**
 * Loads `color.native.ts` as an Android build does and prints its role names,
 * or fails. `react-native` stands in with Android's rules: `Platform.select`
 * takes `android`, else `default`, and `DynamicColorIOS` throws, as React
 * Native's non-iOS `PlatformColorValueTypesIOS.js` does.
 */

import { plugin } from 'bun';

plugin({
  name: 'react-native-android',
  setup(build) {
    build.module('react-native', () => ({
      contents: `
        export const Platform = {
          OS: 'android',
          select: (specifics) => ('android' in specifics ? specifics.android : specifics.default),
        };
        export const PlatformColor = (...names) => ({ resource_paths: names });
        export const DynamicColorIOS = () => {
          throw new Error('DynamicColorIOS is not available on this platform.');
        };
        export const useColorScheme = () => 'light';
      `,
      loader: 'js',
    }));
  },
});

const { color } = await import('../color.native');
process.stdout.write(Object.keys(color).join(' '));
