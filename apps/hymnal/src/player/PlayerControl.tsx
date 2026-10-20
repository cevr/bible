/**
 * A hymn's recording on its page: the play button, what the player is
 * doing, and once the recording plays, a bar to drag to any place in it
 * with the time gone and the whole length. A recording that cannot play
 * says why and offers Retry.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';

import { usePlayer } from './context';
import { Command, type HymnPlayer, Player, type Track } from './player';
import { Scrubber } from './Scrubber';
import { clock } from './time';
import { playerFor, Toggle } from './Toggle';

export function PlayerControl({ track }: { readonly track: Track }) {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Control player={player} track={track} />,
  });
}

/** What the player is doing, in a line beside its button. */
const caption: (player: Player) => string = Player.$match({
  Idle: () => 'Recording',
  Loading: () => 'Loading the recording…',
  Playing: () => 'Playing',
  Buffering: () => 'Loading the recording…',
  Paused: () => 'Paused',
  Ended: () => 'Played to the end',
  Failed: ({ offline }) =>
    Option.match(Option.liftPredicate(offline, Boolean), {
      onNone: () => 'The recording could not be played.',
      onSome: () => 'The recording needs a connection.',
    }),
});

function Control({ player, track }: { readonly player: HymnPlayer; readonly track: Track }) {
  const state = useAtomValue(player.state);
  const send = useAtomSet(player.send);
  const shown = playerFor(state, track);
  const seek = (seconds: number) => send(Command.Seek({ seconds }));
  return (
    <View role="group" aria-label="Recording" style={styles.control}>
      <View style={styles.row}>
        <Toggle track={track} state={state} send={send} />
        <Text aria-live="polite" style={styles.caption} dynamicTypeRamp="subheadline">
          {caption(shown)}
        </Text>
      </View>
      {Player.$match(shown, {
        Idle: () => <></>,
        Loading: () => <></>,
        Playing: ({ at, length }) => <Position at={at} length={length} onSeek={seek} />,
        Buffering: ({ at, length }) => <Position at={at} length={length} onSeek={seek} />,
        Paused: ({ at, length }) => <Position at={at} length={length} onSeek={seek} />,
        Ended: ({ length }) => (
          <Position at={Option.getOrElse(length, () => 0)} length={length} onSeek={seek} />
        ),
        Failed: () => <></>,
      })}
    </View>
  );
}

function Position({
  at,
  length,
  onSeek,
}: {
  readonly at: number;
  readonly length: Option.Option<number>;
  readonly onSeek: (seconds: number) => void;
}) {
  return (
    <View style={styles.position}>
      <Scrubber at={at} length={length} onSeek={onSeek} />
      <View style={styles.times}>
        <Text style={styles.time} dynamicTypeRamp="footnote">
          {clock(at)}
        </Text>
        <Text style={styles.time} dynamicTypeRamp="footnote">
          {Option.match(length, { onNone: () => '–:––', onSome: clock })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  caption: { flex: 1, fontSize: 15, color: color.muted },
  position: { gap: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 13, color: color.muted, fontVariant: ['tabular-nums'] },
});
