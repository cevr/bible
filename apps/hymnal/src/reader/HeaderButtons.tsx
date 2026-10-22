/**
 * The hymn page's header buttons, in a row at the header's top right: the
 * reading button (`Aa`) is to join them before `Chords`. The header draws
 * them on a phone (`headerRight`) and `WebStackHeader` on the web.
 *
 * `Chords` is the reader's one choice for every hymn, kept under the
 * `chords` key: drawn as a guitar's head, selected while chords show.
 */

import { useAtom } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { color } from '~/color';

import { GuitarHead } from './GuitarHead';

export function HeaderButtons({ children }: { readonly children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** Turns chords on or off for every hymn. */
export function ChordsButton({ chords }: { readonly chords: Atom.Writable<boolean> }) {
  const [on, setOn] = useAtom(chords);
  return (
    <Pressable
      role="button"
      aria-label="Chords"
      aria-selected={on}
      onPress={() => setOn(!on)}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <GuitarHead on={on} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { backgroundColor: color.soft },
});
