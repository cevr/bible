import { Option } from 'effect';
import type { FlatList } from 'react-native';

/**
 * How far `list` is scrolled now: on a phone, not read. Its list stays
 * mounted under a pushed hymn and across tabs, so it never opens anew at a
 * kept offset.
 */
export const scrolled = <Item>(_: FlatList<Item>): Option.Option<number> => Option.none();

/** Tells `list` where its scroller is: on a phone, never needed, since a phone hydrates no server list. */
export const told = <Item>(_: FlatList<Item>): void => {};
