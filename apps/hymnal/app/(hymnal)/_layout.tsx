import { Stack, useSafeAreaInsets } from 'one';
import { StyleSheet, View } from 'react-native';

import { LivePlayer } from '~/player/LivePlayer';
import { NowPlayingBar, useHolding } from '~/player/NowPlayingBar';
import { useStackOptions } from '~/stack';
import { color } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

/**
 * The app's one stack: the home screen, which draws its own title (no
 * native header), each hymn pushed over it, and Settings as a sheet. The
 * player plays on across every screen, and while it holds a hymn the
 * now-playing bar is docked under the stack, above the home indicator.
 */
export default function HymnalLayout() {
  return (
    <LivePlayer>
      <View style={styles.column}>
        <View style={styles.stack}>
          <Stack screenOptions={useStackOptions()}>
            {/* The title names the home screen to the back button of a hymn pushed over it. */}
            <Stack.Screen name="index" options={{ title: 'Hymns', headerShown: false }} />
            <Stack.Screen
              name="settings"
              options={{
                title: 'Settings',
                headerShown: false,
                presentation: 'formSheet',
                sheetGrabberVisible: true,
                sheetAllowedDetents: [0.5, 1],
              }}
            />
            {webOnly(<WebStackHeader root="/" title="Hymns" />)}
          </Stack>
        </View>
        <Docked />
      </View>
    </LivePlayer>
  );
}

/** The now-playing bar's frame, there only while the player holds a hymn. */
function Docked() {
  const holding = useHolding();
  const insets = useSafeAreaInsets();
  if (!holding) return <></>;
  return (
    <View style={[styles.docked, { paddingBottom: insets.bottom }]}>
      <NowPlayingBar />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, minHeight: 0, backgroundColor: color.ground },
  stack: { flex: 1, minHeight: 0 },
  docked: {
    backgroundColor: color.ground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
});
