import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { Slot, useServerHeadInsertion } from 'one';
import { useEffect } from 'react';
import { AppRegistry, Platform } from 'react-native';

import { applyAppearance } from '~/appearance';
import { settings } from '~/store';
import { webColors } from '~/color';

/** Shows the stored appearance: the page's colour scheme, or the app's interface style. */
function AppearanceFollower() {
  const appearance = useAtomValue(settings.appearance);
  useEffect(() => applyAppearance(appearance), [appearance]);
  return <></>;
}

export default function Layout() {
  useServerHeadInsertion(() => {
    if (Platform.OS !== 'web') return <></>;
    AppRegistry.registerComponent('styles', () => () => <></>);
    // @ts-expect-error react-native-web's own API
    return AppRegistry.getApplication('styles', {}).getStyleElement();
  });

  if (Platform.OS === 'web') {
    return (
      <html lang="en-US">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
          <meta name="color-scheme" content="light dark" />
          <title>Hymnal</title>
          <link rel="icon" href="/favicon.svg" />
          <style>{webColors}</style>
        </head>
        <body>
          <RegistryProvider>
            <AppearanceFollower />
            <Slot />
          </RegistryProvider>
        </body>
      </html>
    );
  }

  return (
    <RegistryProvider>
      <AppearanceFollower />
      <Slot />
    </RegistryProvider>
  );
}
