/**
 * The full player, a sheet over the stack that the bottom bar opens on its
 * hymn (`/player?hymn=<n>`): the hymn its route names, or the hymn held when
 * it names none, as the bar gives it (`barFor`, the route's hymn as the
 * page). The route is its one source on every platform: the web keeps no
 * page mounted under it, a phone does. Its number and title, a button that
 * goes to the hymn's page (`title.ts`), what the player is
 * doing, its button, and a bar to drag to any place in the recording with
 * the time gone and the whole length. The bar shows in every state, still
 * while the length is not known. A recording that cannot play says why and
 * offers Retry.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { useNavigation, useParams, useRouter } from 'one';
import { type ColorValue, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';
import { hymnHref } from '~/home/Browse';
import { hymnAt } from '~/hymns/hymns';

import { Bar, barFor, placeOf } from './bar';
import { usePlayer } from './context';
import { Command, type HymnPlayer, Player, type Track } from './player';
import { Scrubber } from './Scrubber';
import { clock } from './time';
import { TitleGo, titleGoes } from './title';
import { Toggle } from './Toggle';

export function FullPlayer() {
  return Option.match(usePlayer(), {
    onNone: () => <Nothing />,
    onSome: (player) => <Sheet player={player} />,
  });
}

/** What the player is doing, in a line under its hymn. */
const caption: (player: Player) => string = Player.$match({
  Idle: () => 'Recording',
  Loading: () => 'Loading the recording…',
  Playing: () => 'Playing',
  Buffering: () => 'Loading the recording…',
  Paused: () => 'Paused',
  Ended: () => 'Played to the end',
  Stopped: () => 'Paused',
  Failed: ({ offline }) =>
    Option.match(Option.liftPredicate(offline, Boolean), {
      onNone: () => 'The recording could not be played.',
      onSome: () => 'The recording needs a connection.',
    }),
});

/** The hymn the route names (`?hymn=<n>`), if it names one there is. */
const useRouteHymn = (): Option.Option<Track> =>
  Option.flatMap(Option.fromNullishOr(useParams<{ hymn: string }>().hymn), hymnAt);

function Sheet({ player }: { readonly player: HymnPlayer }) {
  const bar = barFor(useAtomValue(player.state), useRouteHymn());
  const send = useAtomSet(player.send);
  return Bar.$match(bar, {
    Hidden: () => <Nothing />,
    Shown: ({ track, state }) => <Held track={track} state={state} send={send} />,
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
  const { at, length } = Option.getOrElse(placeOf(state), () => ({
    at: 0,
    length: Option.none<number>(),
  }));
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View role="group" aria-label="Recording" style={styles.control}>
        <Title track={track} accent={accent} />
        <Text aria-live="polite" style={styles.caption} dynamicTypeRamp="subheadline">
          {caption(state)}
        </Text>
        <View style={styles.position}>
          <Scrubber at={at} length={length} onSeek={(seconds) => send(Command.Seek({ seconds }))} />
          <View style={styles.times}>
            <Text style={styles.time} dynamicTypeRamp="footnote">
              {clock(at)}
            </Text>
            <Text style={styles.time} dynamicTypeRamp="footnote">
              {Option.match(length, { onNone: () => '–:––', onSome: clock })}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Toggle track={track} state={state} send={send} />
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * The hymn's number and title: a button that goes to its page, closing the
 * sheet (`titleGoes`, from the stack as it is at the press). The player is
 * not told, so the track plays on.
 */
function Title({ track, accent }: { readonly track: Track; readonly accent: ColorValue }) {
  const navigation = useNavigation();
  const router = useRouter();
  const go = () =>
    TitleGo.$match(titleGoes(navigation.getState(), track.number), {
      Close: () => router.back(),
      Open: ({ number }) => router.replace(hymnHref(number)),
    });
  return (
    <Pressable
      role="button"
      aria-label={`${track.number}, ${track.title}`}
      accessibilityHint="Opens the hymn's page."
      onPress={go}
    >
      {({ pressed }) => (
        <Text role="heading" aria-level={1} style={[styles.head, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]}>{`${track.number} `}</Text>
          <Text style={styles.title}>{track.title}</Text>
        </Text>
      )}
    </Pressable>
  );
}

/** The sheet opened with no hymn to play: a link that names none, with nothing held. */
function Nothing() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={1} style={styles.head}>
        Player
      </Text>
      <Text style={styles.caption} dynamicTypeRamp="subheadline">
        No hymn is playing.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 16 },
  control: { gap: 16 },
  head: { fontSize: 22, fontWeight: '700', color: color.ink },
  pressed: { opacity: 0.6 },
  number: { fontVariant: ['tabular-nums'] },
  title: { color: color.ink },
  caption: { fontSize: 15, color: color.muted },
  position: { gap: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 13, color: color.muted, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44 },
});
