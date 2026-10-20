import { Stack } from 'one';

import { stackOptions } from '~/stack';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

export default function SearchLayout() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: 'Search', headerLargeTitleEnabled: true }} />
      {webOnly(<WebStackHeader root="/search" title="Search" />)}
    </Stack>
  );
}
