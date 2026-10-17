import { RegistryProvider } from '@effect/atom-react';
import { Slot, Stack, useServerHeadInsertion } from 'one';
import { AppRegistry, Platform } from 'react-native';

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
          <title>Hymnal</title>
          <link rel="icon" href="/favicon.svg" />
        </head>
        <RegistryProvider>
          <Slot />
        </RegistryProvider>
      </html>
    );
  }

  return (
    <RegistryProvider>
      <Stack />
    </RegistryProvider>
  );
}
