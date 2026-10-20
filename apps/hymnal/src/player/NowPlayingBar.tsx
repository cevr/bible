/**
 * The now-playing bar: the hymn the player holds, its number and title, a
 * link that opens it in the Hymns tab, and the player's button. It draws
 * nothing while the player holds no hymn. On iOS 26 it sits in the tab
 * bar's accessory (the tabs layout); on the web, above the web tab bar.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { Link, useLinkTo } from 'one';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';

import { usePlayer } from './context';
import { type Command, type HymnPlayer, Player, type Track, trackOf } from './player';
import { Toggle } from './Toggle';

const none = Atom.make<Player>(Player.Idle());

/** Whether the player holds a hymn: the bar has something to show. */
export const useHolding = () =>
  Option.isSome(
    trackOf(
      useAtomValue(
        Option.match(usePlayer(), { onNone: () => none, onSome: (player) => player.state }),
      ),
    ),
  );

export function NowPlayingBar() {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Bar player={player} />,
  });
}

function Bar({ player }: { readonly player: HymnPlayer }) {
  const state = useAtomValue(player.state);
  const send = useAtomSet(player.send);
  return Option.match(trackOf(state), {
    onNone: () => <></>,
    onSome: (track) => <Held track={track} state={state} send={send} />,
  });
}

function Held({
  track,
  state,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  const link = useLinkTo({ href: Link.resolveHref(`/hymns/${track.number}`) });
  return (
    <View role="region" aria-label="Now playing" style={[styles.bar, frame]}>
      <Pressable
        {...link}
        aria-label={`Now playing ${track.number}, ${track.title}`}
        style={styles.open}
      >
        <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
          {track.number}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
      </Pressable>
      <Toggle track={track} state={state} send={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  // The web draws the bar's own edge; iOS's accessory is a glass capsule of the system's.
  web: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { flex: 1, fontSize: 15, color: color.ink },
});

const frame = Platform.OS === 'web' && styles.web;
