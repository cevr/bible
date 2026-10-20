/**
 * A list of hymns, each row its number and title, opening the hymn at
 * `hrefOf(number)` (in the same tab), or saying `empty` when it has none.
 */

import { type Href, Link } from 'one';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

export function HymnList({
  hymns,
  hrefOf,
  empty,
}: {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly hrefOf: (number: number) => Href;
  readonly empty?: string;
}) {
  const accent = useAccent();
  return (
    <FlatList
      data={hymns}
      keyExtractor={(hymn) => String(hymn.number)}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => (
        // The row's own View carries the style: on the web, `Link asChild`
        // replaces its child's `style` prop.
        <Link href={hrefOf(item.number)} asChild>
          <Pressable aria-label={`${item.number}, ${item.title}`}>
            {({ pressed }) => (
              <View style={[styles.row, pressed && styles.pressed]}>
                <Text style={[styles.number, { color: accent }]} dynamicTypeRamp="body">
                  {item.number}
                </Text>
                <Text style={styles.title} dynamicTypeRamp="body">
                  {item.title}
                </Text>
              </View>
            )}
          </Pressable>
        </Link>
      )}
    />
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
