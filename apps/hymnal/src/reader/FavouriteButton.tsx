/**
 * The hymn page head's `Favourite` button, at the end of the number's row:
 * a press keeps the hymn among the reader's Favourites (`lists.favourites`,
 * in number order), a second press takes it out. Selected while the hymn is
 * a favourite, drawn as a star, filled then.
 */

import { useAtom } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import { Pressable, StyleSheet } from 'react-native';

import { color } from '~/color';

import { toggleFavourite } from './lists';
import { StarMark } from './StarMark';

export function FavouriteButton({
  number,
  favourites,
}: {
  readonly number: number;
  readonly favourites: Atom.Writable<ReadonlyArray<number>>;
}) {
  const [list, setList] = useAtom(favourites);
  const on = list.includes(number);
  return (
    <Pressable
      role="button"
      aria-label="Favourite"
      aria-selected={on}
      onPress={() => setList((now) => toggleFavourite(now, number))}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <StarMark on={on} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    marginLeft: 'auto',
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { backgroundColor: color.soft },
});
