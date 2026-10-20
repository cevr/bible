import { Stack } from 'one';

import { useAccent } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';

export default function HymnsLayout() {
  const accent = useAccent();
  return (
    <Stack screenOptions={{ headerTintColor: accent }}>
      <Stack.Screen name="index" options={{ title: 'Hymns', headerLargeTitleEnabled: true }} />
      <WebStackHeader root="/" title="Hymns" />
    </Stack>
  );
}
