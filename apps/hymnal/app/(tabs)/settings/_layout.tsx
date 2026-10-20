import { Stack } from 'one';

import { useAccent } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';

export default function SettingsLayout() {
  const accent = useAccent();
  return (
    <Stack screenOptions={{ headerTintColor: accent }}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitleEnabled: true }} />
      <WebStackHeader root="/settings" title="Settings" />
    </Stack>
  );
}
