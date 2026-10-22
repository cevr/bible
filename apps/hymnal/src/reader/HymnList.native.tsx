/**
 * A phone's list of hymns (LegendList), each row its number and title, a
 * link to the hymn at `hrefOf(number)`, or saying `empty` when it has none.
 *
 * With `byTopic`, a row names each run of hymns in one topic (`rowsOf`), and
 * the list pins it at its top while that run's hymns scroll under it.
 * Every row is one line of one height, scaled with the reader's text size,
 * so the list knows each row's size before it draws it (`getFixedItemSize`)
 * and reuses a row's view for the next row it shows (`recycleItems`).
 *
 * A phone never mounts the list anew under a pushed hymn or a sheet, so it
 * keeps its own place, and `offset` is the web's alone.
 */

import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { type Href, Link, useLinkTo } from 'one';
import { useMemo } from 'react';
import {
  type ColorValue,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

import type { HymnListProps } from './HymnList';
import { dismissal } from './keyboard';
import { type Row, rowsOf } from './rows';

/** A hymn row's line of text, and the space above and below it, at the reader's usual text size. */
const line = 22;
const padding = 11;

/** A topic row's line of text, and the space above and below it. */
const topicLine = 20;
const topicPadding = 8;

/** A row's height at the reader's text size (`fontScale`), as its text scales. */
const heightOf = (kind: Row<HymnText>['kind'], fontScale: number) => {
  if (kind === 'topic') return Math.ceil(topicLine * fontScale) + 2 * topicPadding;
  return Math.ceil(line * fontScale) + 2 * padding;
};

const hymnRows = (hymns: ReadonlyArray<HymnText>) => ({
  rows: hymns.map((hymn): Row<HymnText> => ({ kind: 'hymn', key: `hymn:${hymn.number}`, hymn })),
  sticky: [],
});

/**
 * What a row reads from outside its item. The list draws a row again only
 * when its item or this changes, so a row reads nothing else: `drawRow`
 * sits outside the component and sees its item and this alone.
 */
interface Look {
  readonly accent: ColorValue;
  readonly hymnHeight: number;
  readonly topicHeight: number;
  readonly hrefOf: HymnListProps['hrefOf'];
}

const drawRow = ({
  item,
  extraData,
}: {
  readonly item: Row<HymnText>;
  readonly extraData: Look;
}) => {
  if (item.kind === 'topic') return <Topic name={item.name} height={extraData.topicHeight} />;
  return (
    <HymnRow
      hymn={item.hymn}
      href={extraData.hrefOf(item.hymn.number)}
      height={extraData.hymnHeight}
      accent={extraData.accent}
    />
  );
};

export function HymnList({ hymns, hrefOf, empty, byTopic = false, pullDown }: HymnListProps) {
  const { fontScale } = useWindowDimensions();
  const accent = useAccent();
  const { rows, sticky } = useMemo(() => {
    if (byTopic) return rowsOf(hymns);
    return hymnRows(hymns);
  }, [hymns, byTopic]);
  const hymnHeight = heightOf('hymn', fontScale);
  const topicHeight = heightOf('topic', fontScale);
  const look = useMemo(
    (): Look => ({ accent, hymnHeight, topicHeight, hrefOf }),
    [accent, hymnHeight, topicHeight, hrefOf],
  );
  return (
    <AnimatedLegendList
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.kind}
      getFixedItemSize={(_, __, kind) => {
        if (kind === 'topic') return topicHeight;
        return hymnHeight;
      }}
      estimatedItemSize={hymnHeight}
      recycleItems
      stickyHeaderIndices={[...sticky]}
      ListHeaderComponent={pullDown?.node}
      estimatedHeaderSize={pullDown?.height}
      // The list opens with the search field tucked under the title, and a
      // drag let go between there and the top settles at one or the other;
      // past the field it scrolls freely.
      initialScrollOffset={pullDown?.rest}
      snapToOffsets={pullDown && [0, pullDown.rest]}
      snapToEnd={false}
      sharedValues={{ scrollOffset: pullDown?.scroll }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      {...dismissal}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      extraData={look}
      renderItem={drawRow}
    />
  );
}

/** A topic's row: its name, quiet, on the ground, so the rows under it pass unseen while it is pinned. */
function Topic({ name, height }: { readonly name: string; readonly height: number }) {
  return (
    <View accessible role="heading" aria-label={name} style={[styles.topic, { height }]}>
      <Text style={styles.topicName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** One hymn's row: a link the router opens in the app. */
function HymnRow({
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
    backgroundColor: color.ground,
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
  topic: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.ground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  topicName: { fontSize: 15, lineHeight: topicLine, fontWeight: '600', color: color.muted },
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
