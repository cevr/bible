/**
 * A list of hymns, each row its number and title, a link to the hymn at
 * `hrefOf(number)` (in the same tab), or saying `empty` when it has none.
 *
 * The list keeps its scroll offset in `offset` as it unmounts, and a list
 * mounted anew (on the web, Back and a tab switch mount it again) opens at
 * that offset.
 * Every row is one line of one height, scaled with the reader's text size,
 * so the list knows where each row is before it draws it (`getItemLayout`):
 * it can open at any offset, down to the last row, at once, and never moves
 * after the reader takes over.
 */

import { RegistryContext } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { type Href, Link, useLinkTo } from 'one';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import {
  type ColorValue,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

import { scrolled } from './scrolled';

/** A row's line of text, and the space above and below it, at the reader's usual text size. */
const line = 22;
const padding = 11;

/** A row's height at the reader's text size (`fontScale`): one line and its padding, 44 at 1. */
export const rowHeight = (fontScale: number) => Math.ceil(line * fontScale) + 2 * padding;

export function HymnList({
  hymns,
  hrefOf,
  offset,
  empty,
}: {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly hrefOf: (number: number) => Href;
  readonly offset: Atom.Writable<number>;
  readonly empty?: string;
}) {
  const accent = useAccent();
  const screen = useWindowDimensions();
  const height = rowHeight(screen.fontScale);
  const registry = useContext(RegistryContext);
  const list = useRef<Option.Option<FlatList<HymnText>>>(Option.none());
  // The saved offset this mount opens at, and the row there, drawn first.
  const [opening] = useState(() => Option.liftPredicate(registry.get(offset), (y) => y > 0));
  const first = Option.map(opening, (y) => Math.min(Math.floor(y / height), hymns.length - 1)).pipe(
    Option.filter((index) => index >= 0),
  );
  // It opens there before its first frame is painted, so the reader never sees
  // it elsewhere; it keeps where he leaves it as it unmounts, its scroller still
  // in the page.
  useLayoutEffect(() => {
    Option.map(
      Option.zipWith(list.current, opening, (l, y) => [l, y] as const),
      ([l, y]) => l.scrollToOffset({ offset: y, animated: false }),
    );
    return () => {
      Option.map(Option.flatMap(list.current, scrolled), (y) => registry.set(offset, y));
    };
  }, []);
  return (
    <FlatList
      ref={(node) => {
        list.current = Option.fromNullishOr(node);
      }}
      data={hymns}
      keyExtractor={(hymn) => String(hymn.number)}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      initialScrollIndex={Option.getOrUndefined(first)}
      // Where it opens: the list then leaves its own scroll to the row alone.
      contentOffset={Option.getOrUndefined(Option.map(opening, (y) => ({ x: 0, y })))}
      // Enough rows to fill the window wherever it opens, past a row cut at its
      // top; never fewer than the list's own 10 (a window not yet measured is 0 high).
      initialNumToRender={Math.max(10, Math.ceil(screen.height / height) + 1)}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => (
        <Row hymn={item} href={hrefOf(item.number)} height={height} accent={accent} />
      )}
    />
  );
}

/**
 * One hymn's row: a link (an anchor on the web), so Enter, a Cmd-click and
 * "Open in New Tab" work as on any link. A plain press opens the hymn
 * through the router, inside the app (`useLinkTo`'s press keeps the browser
 * from loading the page anew).
 */
function Row({
  hymn,
  href,
  height,
  accent,
}: {
  readonly hymn: HymnText;
  readonly href: Href;
  readonly height: number;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href: Link.resolveHref(href) });
  return (
    <Pressable {...link} aria-label={`${hymn.number}, ${hymn.title}`}>
      {({ pressed }) => (
        <View style={[styles.row, { height }, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
            {hymn.number}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {hymn.title}
          </Text>
          <View style={styles.separator} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  pressed: { backgroundColor: color.separator },
  number: {
    minWidth: 36,
    fontSize: 17,
    lineHeight: line,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  title: { flex: 1, fontSize: 17, lineHeight: line, color: color.label },
  empty: { padding: 16, fontSize: 17, color: color.secondaryLabel },
  separator: {
    position: 'absolute',
    left: 64,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
});
