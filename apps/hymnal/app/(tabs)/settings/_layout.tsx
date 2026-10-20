import { Stack } from 'one';

import { stackOptions } from '~/stack';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitleEnabled: true }} />
      {webOnly(<WebStackHeader root="/settings" title="Settings" />)}
    </Stack>
  );
}
