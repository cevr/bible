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

import { dismissal } from './keyboard';
import { scrolled, told } from './scrolled';

/** A row's line of text, and the space above and below it, at the reader's usual text size. */
const line = 22;
const padding = 11;

/** A row's height at the reader's text size (`fontScale`): one line and its padding, 44 at 1. */
const rowHeight = (fontScale: number) => Math.ceil(line * fontScale) + 2 * padding;

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
  // The saved offset this mount opens at, until the list has scrolled there;
  // none for a list that opens at its top. Every list the server renders
  // opens at its top, and so does every list the browser hydrates (a kept
  // offset lives only in the running app), so the two render the same rows,
  // whatever the window.
  const [opening, setOpening] = useState(() =>
    Option.liftPredicate(registry.get(offset), (y) => y > 0),
  );
  // Whether it has landed: React may run the opening scroll again (its
  // development StrictMode does), and a list that has landed is the
  // reader's, so it is not scrolled there again.
  const arrived = useRef(false);
  const landed = () => {
    arrived.current = true;
    setOpening(Option.none());
  };
  // The row at the offset it opens at: its first frame is drawn from there.
  const first = Option.map(opening, (y) => Math.min(Math.floor(y / height), hymns.length - 1)).pipe(
    Option.filter((index) => index >= 0),
  );
  // It scrolls there once, before its first frame is painted, so the reader
  // never sees it elsewhere; a list too short to reach it stays at its top,
  // and no scroll comes to say it has landed. A list that opens at its top
  // may find its scroller moved already: the reader scrolled the server's
  // list before the browser hydrated it, and the list is told where he is, so
  // it draws the rows there. It keeps where he leaves it as it unmounts, its
  // scroller still in the page.
  useLayoutEffect(() => {
    Option.map(list.current, (l) => {
      const now = () => Option.getOrElse(scrolled(l), () => 0);
      Option.match(opening, {
        onSome: (y) => {
          if (arrived.current) return;
          l.scrollToOffset({ offset: y, animated: false });
          if (now() === 0) landed();
        },
        onNone: () => {
          if (now() > 0) told(l);
        },
      });
    });
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
      // The opening props hold only until its scroll lands: react-native-web's
      // list keeps its window where it opened while `initialScrollIndex` is set
      // and the list is at its top, and draws no top rows under it, so a list
      // that kept them would show blank rows once the reader reached the top.
      onScroll={() => Option.map(opening, landed)}
      initialScrollIndex={Option.getOrUndefined(first)}
      // Where it opens: the list then leaves its own scroll to the row alone.
      contentOffset={Option.getOrUndefined(Option.map(opening, (y) => ({ x: 0, y })))}
      // While it opens, enough rows to fill the window, past a row cut at its
      // top; never fewer than the list's own 10.
      initialNumToRender={Option.getOrUndefined(
        Option.map(opening, () => Math.max(10, Math.ceil(screen.height / height) + 1)),
      )}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...dismissal}
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
  pressed: { backgroundColor: color.soft },
  number: {
    minWidth: 36,
    fontSize: 17,
    lineHeight: line,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  title: { flex: 1, fontSize: 17, lineHeight: line, color: color.ink },
  empty: { padding: 16, fontSize: 17, color: color.muted },
  separator: {
    position: 'absolute',
    left: 64,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
  },
});
