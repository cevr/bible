import { Keyboard, type FlatListProps } from 'react-native';

/**
 * When a list puts the keyboard away: on the web, when the reader drags it
 * with a finger, and never on a scroll alone. A web list's scroll comes from
 * the reader's wheel, from the list opening at its saved offset, and from a
 * list told where the reader scrolled it before the page hydrated; a scroll
 * that put the keyboard away would take the focus from the search field the
 * reader is typing in.
 */
export const dismissal: Pick<FlatListProps<unknown>, 'keyboardDismissMode' | 'onTouchMove'> = {
  keyboardDismissMode: 'none',
  onTouchMove: () => Keyboard.dismiss(),
};
