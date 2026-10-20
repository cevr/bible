import { Option } from 'effect';
import type { FlatList } from 'react-native';

/** How far `list` is scrolled now: on the web, its scroller element's offset. */
export const scrolled = <Item>(list: FlatList<Item>): Option.Option<number> => {
  const node: HTMLElement = list.getScrollableNode();
  return Option.some(node.scrollTop);
};
