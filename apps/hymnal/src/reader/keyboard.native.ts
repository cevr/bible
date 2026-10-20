import type { FlatListProps } from 'react-native';

/** When a list puts the keyboard away: on a phone, as the reader drags it. */
export const dismissal: Pick<FlatListProps<unknown>, 'keyboardDismissMode' | 'onTouchMove'> = {
  keyboardDismissMode: 'on-drag',
};
