/**
 * The player's buttons for a hymn, as the player stands: Play when it
 * holds another hymn or none, Pause while it plays or buffers (and Retry
 * beside it once a wait online runs long), Play while paused or stopped (from
 * the reader's place), Play again once ended and Retry once failed; a spinner
 * while it loads. Retry and Play from a place are Resume. The
 * button is in the accent (`AccentButton`): a `UIButton`'s title on iOS, an
 * accent fill under `onAccent` on the web and Android.
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAccent } from '~/color';

import { AccentButton } from './AccentButton';
import { playerFor } from './bar';
import { Command, Player, type Track } from './player';

export function Toggle({
  track,
  state,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  const button = (title: string, label: string, command: Command) => (
    <AccentButton title={title} label={label} onPress={() => send(command)} />
  );
  return Player.$match(playerFor(state, track), {
    Idle: () => button('Play', `Play hymn ${track.number}`, Command.Start({ track })),
    Loading: () => (
      <ActivityIndicator color={accent} accessibilityLabel={`Loading hymn ${track.number}`} />
    ),
    Playing: () => button('Pause', `Pause hymn ${track.number}`, Command.Pause()),
    Buffering: ({ retry }) => (
      <View style={styles.pair}>
        {retry && button('Retry', `Retry hymn ${track.number}`, Command.Resume())}
        {button('Pause', `Pause hymn ${track.number}`, Command.Pause())}
      </View>
    ),
    Paused: () => button('Play', `Play hymn ${track.number}`, Command.Resume()),
    Ended: () => button('Play again', `Play hymn ${track.number} again`, Command.Resume()),
    Stopped: () => button('Play', `Play hymn ${track.number}`, Command.Resume()),
    Failed: () => button('Retry', `Retry hymn ${track.number}`, Command.Resume()),
  });
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
