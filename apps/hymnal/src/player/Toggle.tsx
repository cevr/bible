/**
 * The player's one button for a hymn, as the player stands: Play when it
 * holds another hymn or none, Pause while it plays, Play while paused, Play
 * again once ended and Retry once failed; a spinner while it loads. A
 * native button (a `UIButton` on iOS) in the accent.
 */

import { Option } from 'effect';
import { ActivityIndicator, Button } from 'react-native';

import { useAccent } from '~/color';

import { Command, Player, type Track, trackOf } from './player';

/** The player as `track` sees it: its own state, or idle when it holds another hymn. */
export const playerFor = (state: Player, track: Track): Player =>
  trackOf(state).pipe(
    Option.filter((held) => held.number === track.number),
    Option.match({ onNone: () => Player.Idle(), onSome: () => state }),
  );

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
    <Button title={title} accessibilityLabel={label} color={accent} onPress={() => send(command)} />
  );
  return Player.$match(playerFor(state, track), {
    Idle: () => button('Play', `Play hymn ${track.number}`, Command.Start({ track })),
    Loading: () => (
      <ActivityIndicator color={accent} accessibilityLabel={`Loading hymn ${track.number}`} />
    ),
    Playing: () => button('Pause', `Pause hymn ${track.number}`, Command.Pause()),
    Paused: () => button('Play', `Play hymn ${track.number}`, Command.Resume()),
    Ended: () => button('Play again', `Play hymn ${track.number} again`, Command.Resume()),
    Failed: () => button('Retry', `Retry hymn ${track.number}`, Command.Start({ track })),
  });
}
