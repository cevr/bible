import { Option } from 'effect';
import type { FlatList } from 'react-native';

/** How far `list` is scrolled now: on the web, its scroller element's offset. */
export const scrolled = <Item>(list: FlatList<Item>): Option.Option<number> => {
  const node: HTMLElement = list.getScrollableNode();
  return Option.some(node.scrollTop);
};

/**
 * Tells `list` where its scroller is now, as a scroll does: on the web, a
 * scroll event on its scroller element, which moves nothing.
 */
export const told = <Item>(list: FlatList<Item>): void => {
  const node: HTMLElement = list.getScrollableNode();
  node.dispatchEvent(new Event('scroll'));
};
