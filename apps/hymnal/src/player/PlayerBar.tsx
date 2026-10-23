/**
 * The bottom bar. On a hymn page it is that hymn's player, unless another
 * hymn sounds; off a page it shows only while the player holds a hymn
 * (`barFor`). While the player holds a hymn, the bar is docked under the
 * stack (`PlayerBar`, in the hymnal's layout), as the player plays on across
 * screens. While it holds none, the hymn page draws the bar as its own
 * (`PageBar`), so the bar comes in with the page's push and goes out with
 * its back, frame for frame. It holds the hymn's number and title, a button
 * that opens the full player on the bar's hymn (`/player?hymn=<n>`), the
 * Sound switch and the player's button, and, while
 * another hymn sounds over a page, a compact Play for the page's hymn. A thin
 * seek line along its top edge shows the part played; it takes no touch, as
 * seeking is the full player's.
 */

import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Match, Option } from 'effect';
import { Link, useLinkTo, useSafeAreaInsets } from 'one';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';
import { settings } from '~/store';

import { Bar, dockedBar, pageBar, playedShare, toldPlace } from './bar';
import { usePlayer } from './context';
import { useShownPage } from './page';
import { Command, type HymnPlayer, type Player, type Track } from './player';
import { BarMark } from './BarMark';
import { buttonsOf } from './button';

/** The bar docked under the stack, while the player holds a hymn. */
export function PlayerBar() {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <Docked player={player} />,
  });
}

/** The bar `track`'s page draws as its own, while the player holds no hymn. */
export function PageBar({ track }: { readonly track: Track }) {
  return Option.match(usePlayer(), {
    onNone: () => <></>,
    onSome: (player) => <OnPage player={player} track={track} />,
  });
}

/** The docked bar the player's state and the page shown give: the stack's bottom follows it. */
export const useDockedBar = (player: HymnPlayer) =>
  dockedBar(useAtomValue(player.state), useShownPage());

function Docked({ player }: { readonly player: HymnPlayer }) {
  return <Drawn bar={useDockedBar(player)} player={player} />;
}

function OnPage({ player, track }: { readonly player: HymnPlayer; readonly track: Track }) {
  return <Drawn bar={pageBar(useAtomValue(player.state), track)} player={player} />;
}

/** `bar` drawn: nothing, or the bar in its frame over the home indicator. */
function Drawn({ bar, player }: { readonly bar: Bar; readonly player: HymnPlayer }) {
  const send = useAtomSet(player.send);
  const insets = useSafeAreaInsets();
  return Bar.$match(bar, {
    Hidden: () => <></>,
    Shown: ({ track, state, page }) => (
      <View
        role="region"
        aria-label="Player"
        style={[styles.frame, { paddingBottom: Math.max(insets.bottom, 0) }]}
      >
        <SeekLine state={state} />
        <View style={styles.bar}>
          <Opener track={track} state={state} />
          {Option.match(page, {
            onNone: () => <></>,
            onSome: (shown) => <PlayPage track={shown} send={send} />,
          })}
          <Sound />
          <Buttons track={track} state={state} send={send} />
        </View>
      </View>
    ),
  });
}

/**
 * The bar's body: the hymn's number and title, a button that opens the full
 * player on the bar's hymn (`/player?hymn=<n>`), so the player shows what the
 * bar showed whether or not the page under it stays mounted.
 */
function Opener({ track, state }: { readonly track: Track; readonly state: Player }) {
  const accent = useAccent();
  const link = useLinkTo({
    href: Link.resolveHref({ pathname: '/player', params: { hymn: String(track.number) } }),
  });
  return (
    <Pressable
      {...link}
      role="button"
      aria-label="Open player"
      aria-valuetext={Option.getOrUndefined(toldPlace(state))}
      style={styles.open}
    >
      <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
        {track.number}
      </Text>
      <Text style={styles.title} numberOfLines={1}>
        {track.title}
      </Text>
    </Pressable>
  );
}

/** The page's hymn played in place of the one sounding: a compact text button. */
function PlayPage({
  track,
  send,
}: {
  readonly track: Track;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  return (
    <Pressable
      role="button"
      aria-label={`Play hymn ${track.number}`}
      onPress={() => send(Command.Start({ track }))}
      style={styles.compact}
    >
      <Text style={[styles.compactText, { color: accent }]}>{`Play ${track.number}`}</Text>
    </Pressable>
  );
}

/**
 * Whether Play sounds the recording: on, a speaker with waves in the accent;
 * off, a speaker with a slash, muted, and the score clock runs (`sound.ts`).
 * It sits left of the player's button, so Play keeps its place at the bar's
 * end.
 */
function Sound() {
  const [on, setOn] = useAtom(settings.sound);
  const accent = useAccent();
  const tint = [color.muted, accent][Number(on)] ?? accent;
  return (
    <Pressable
      role="button"
      aria-label="Sound"
      aria-checked={on}
      onPress={() => setOn(!on)}
      style={pressedSoft}
    >
      <BarMark mark={(['sound-off', 'sound-on'] as const)[Number(on)] ?? 'sound-on'} tint={tint} />
    </Pressable>
  );
}

/**
 * The player's buttons for the bar's hymn (`buttonsOf`) as marks in the
 * accent, the size of the Sound mark; a spinner in the same box while it
 * loads.
 */
function Buttons({
  track,
  state,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  return buttonsOf(state, track).map((button) =>
    Option.match(button.command, {
      onNone: () => (
        <View key={button.kind} style={styles.mark}>
          <ActivityIndicator color={accent} accessibilityLabel={button.label} />
        </View>
      ),
      onSome: (command) => (
        <Pressable
          key={button.kind}
          role="button"
          aria-label={button.label}
          onPress={() => send(command)}
          style={pressedSoft}
        >
          {Match.value(button.kind).pipe(
            Match.when('loading', () => <></>),
            Match.orElse((kind) => <BarMark mark={kind} tint={accent} />),
          )}
        </Pressable>
      ),
    }),
  );
}

/** A mark's target: 44 by 44, `color.soft` behind it while pressed. */
const pressedSoft = ({ pressed }: { readonly pressed: boolean }) => [
  styles.mark,
  pressed && styles.pressed,
];

/** The part played, along the bar's top edge, over a hairline of the rest; it takes no touch. */
function SeekLine({ state }: { readonly state: Player }) {
  const accent = useAccent();
  return (
    <View aria-hidden pointerEvents="none" testID="seek-line" style={styles.line}>
      <View
        testID="seek-played"
        style={[styles.played, { width: `${playedShare(state) * 100}%`, backgroundColor: accent }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: color.ground },
  line: { height: 2, backgroundColor: color.line },
  played: { height: 2 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { flex: 1, fontSize: 15, color: color.ink },
  compact: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  compactText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { backgroundColor: color.soft },
});
