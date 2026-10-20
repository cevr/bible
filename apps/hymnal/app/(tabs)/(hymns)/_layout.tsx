import { Stack } from 'one';

import { stackOptions } from '~/stack';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

export default function HymnsLayout() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: 'Hymns', headerLargeTitleEnabled: true }} />
      {webOnly(<WebStackHeader root="/" title="Hymns" />)}
    </Stack>
  );
}
