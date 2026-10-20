import { Stack } from 'one';

import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

export default function HymnsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Hymns', headerLargeTitleEnabled: true }} />
      {webOnly(<WebStackHeader root="/" title="Hymns" />)}
    </Stack>
  );
}
