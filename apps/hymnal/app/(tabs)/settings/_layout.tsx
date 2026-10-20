import { Stack } from 'one';

import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitleEnabled: true }} />
      {webOnly(<WebStackHeader root="/settings" title="Settings" />)}
    </Stack>
  );
}
