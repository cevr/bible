import { Stack } from 'one';
import { StyleSheet, View } from 'react-native';

import { LivePlayer } from '~/player/LivePlayer';
import { PlayerBar } from '~/player/PlayerBar';
import { StackBottom } from '~/player/StackBottom';
import { stackHeaders } from '~/reader/screen';
import { useStackOptions } from '~/stack';
import { color } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

/**
 * The app's one stack: the home screen, which draws its own title (no
 * native header), each hymn and the Recent list pushed over it, and Settings, the reading
 * settings and the full player as sheets. The player plays on across every
 * screen; its bar is docked under the stack, above the home indicator, on a hymn page and
 * wherever the player holds a hymn (`PlayerBar`). The screens are told the
 * bottom inset they meet as the bar shows or hides (`StackBottom`).
 */
export default function HymnalLayout() {
  return (
    <LivePlayer>
      <View style={styles.column}>
        <View style={styles.stack}>
          <StackBottom>
            <Stack screenOptions={useStackOptions(stackHeaders)}>
              {/* The title names the home screen to the back button of a hymn pushed over it. */}
              <Stack.Screen name="index" options={{ title: 'Hymns', headerShown: false }} />
              <Stack.Screen name="recent" options={{ title: 'Recent' }} />
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
              <Stack.Screen
                name="reading"
                options={{
                  title: 'Reading',
                  headerShown: false,
                  presentation: 'formSheet',
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.7, 1],
                }}
              />
              <Stack.Screen
                name="player"
                options={{
                  title: 'Player',
                  headerShown: false,
                  presentation: 'formSheet',
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.5, 1],
                }}
              />
              {webOnly(<WebStackHeader root="/" title="Hymns" />)}
            </Stack>
          </StackBottom>
        </View>
        <PlayerBar />
      </View>
    </LivePlayer>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, minHeight: 0, backgroundColor: color.ground },
  stack: { flex: 1, minHeight: 0 },
});
