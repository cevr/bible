/**
 * A list of hymns, each row its number and title, opening the hymn at
 * `hrefOf(number)` (in the same tab), or saying `empty` when it has none.
 * The list keeps its scroll offset in `offset`, and a list mounted anew
 * scrolls back to it.
 */

import { RegistryContext } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { useLinkTo } from 'one';
import { useContext, useRef } from 'react';
import { type ColorValue, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

export function HymnList({
  hymns,
  hrefOf,
  offset,
  empty,
}: {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly hrefOf: (number: number) => string;
  readonly offset: Atom.Writable<number>;
  readonly empty?: string;
}) {
  const accent = useAccent();
  const registry = useContext(RegistryContext);
  const list = useRef<Option.Option<FlatList<HymnText>>>(Option.none());
  // The offset to scroll back to, until the list is long enough to reach it.
  const restore = useRef(registry.get(offset));
  const height = useRef(0);
  return (
    <FlatList
      ref={(node) => {
        list.current = Option.fromNullishOr(node);
      }}
      data={hymns}
      keyExtractor={(hymn) => String(hymn.number)}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={100}
      onScroll={(event) => registry.set(offset, event.nativeEvent.contentOffset.y)}
      onLayout={(event) => {
        height.current = event.nativeEvent.layout.height;
      }}
      onContentSizeChange={(_, content) => {
        if (restore.current <= 0 || content - height.current < restore.current) return;
        Option.map(list.current, (l) =>
          l.scrollToOffset({ offset: restore.current, animated: false }),
        );
        restore.current = 0;
      }}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => <Row hymn={item} href={hrefOf(item.number)} accent={accent} />}
    />
  );
}

/**
 * One hymn's row. A press opens the hymn through the router, inside the app:
 * on the web, `useLinkTo`'s press keeps the browser from loading the page
 * anew (a `Pressable` under `Link asChild` takes the link's click for its
 * own, and the browser then follows the anchor).
 */
function Row({
  hymn,
  href,
  accent,
}: {
  readonly hymn: HymnText;
  readonly href: string;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href });
  return (
    <Pressable role="link" aria-label={`${hymn.number}, ${hymn.title}`} onPress={link.onPress}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]} dynamicTypeRamp="body">
            {hymn.number}
          </Text>
          <Text style={styles.title} dynamicTypeRamp="body">
            {hymn.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  pressed: { backgroundColor: color.separator },
  number: {
    minWidth: 36,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  title: { flex: 1, fontSize: 17, color: color.label },
  empty: { padding: 16, fontSize: 17, color: color.secondaryLabel },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
    backgroundColor: color.separator,
  },
});
