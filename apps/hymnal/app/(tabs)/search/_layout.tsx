import { Stack } from 'one';

import { useAccent } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';

export default function SearchLayout() {
  const accent = useAccent();
  return (
    <Stack screenOptions={{ headerTintColor: accent }}>
      <Stack.Screen name="index" options={{ title: 'Search', headerLargeTitleEnabled: true }} />
      <WebStackHeader root="/search" title="Search" />
    </Stack>
  );
}
