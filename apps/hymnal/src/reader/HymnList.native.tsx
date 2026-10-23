/**
 * A phone's list of hymns (LegendList), each row its number and title, a
 * link to the hymn at `hrefOf(number)`, or saying `empty` when it has none.
 *
 * With `byTopic`, a row names each run of hymns in one topic (`rowsOf`), and
 * a copy of it stays pinned at the list's top while that run's hymns scroll
 * under it (`PinnedTopic`). Above the topics, each of the reader's lists
 * that holds a hymn (`shelves`: Recent) is a run of its own under a row
 * naming it, pinned as a topic's is. A row of one of the reader's
 * `favourites` carries a small star before its title, in every run, and
 * VoiceOver reads it as a favourite. The pin follows the scroll offset on the UI
 * thread from the topics' fixed places (`pin.ts`), not the list's sticky
 * headers: those wait on the JS thread at each handoff, and a fast drag
 * showed the row missing or out of place for a frame.
 * After its last row the list keeps `ListEnd`, the end space over the bottom
 * inset it meets, so the row ends clear of the home indicator, or of the
 * bar docked under the stack while it shows.
 * Every row is one line of one height, scaled with the reader's text size,
 * so the list knows each row's size before it draws it (`getFixedItemSize`)
 * and reuses a row's view for the next row it shows (`recycleItems`).
 *
 * A phone never mounts the list anew under a pushed hymn or a sheet, so it
 * keeps its own place, and `offset` is the web's alone. Rows added above
 * (a hymn joining Recent) keep the rows in view where they were, unless the
 * list is at its top.
 */

import { useAtomSet } from '@effect/atom-react';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { Option } from 'effect';
import { type Href, Link, useLinkTo } from 'one';
import { useMemo } from 'react';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
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
import { ListEnd } from './ListEnd';
import { dismissal } from './keyboard';
import { pinnedAt, topicStarts } from './pin';
import { pagesFrom } from './place';
import { plainRowsOf, type Row, rowsOf } from './rows';

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
      source={item.source}
      favourite={item.favourite}
      height={extraData.hymnHeight}
      accent={extraData.accent}
    />
  );
};

export function HymnList({
  hymns,
  hrefOf,
  empty,
  byTopic = false,
  shelves,
  favourites,
  pullDown,
}: HymnListProps) {
  const { fontScale } = useWindowDimensions();
  const accent = useAccent();
  const { rows, sticky } = useMemo(() => {
    if (byTopic) return rowsOf(hymns, shelves, favourites);
    return plainRowsOf(hymns, favourites);
  }, [hymns, byTopic, shelves, favourites]);
  const hymnHeight = heightOf('hymn', fontScale);
  const topicHeight = heightOf('topic', fontScale);
  const look = useMemo(
    (): Look => ({
      accent,
      hymnHeight,
      topicHeight,
      hrefOf,
    }),
    [accent, hymnHeight, topicHeight, hrefOf],
  );
  const header = pullDown?.height ?? 0;
  const topics = useMemo(
    () => ({
      names: sticky.flatMap((i) => rows.slice(i, i + 1).flatMap((row) => names(row))),
      starts: topicStarts(rows, header, (kind) => ({ topic: topicHeight, hymn: hymnHeight })[kind]),
    }),
    [rows, sticky, header, topicHeight, hymnHeight],
  );
  const own = useSharedValue(0);
  const scroll = pullDown?.scroll ?? own;
  const rest = pullDown?.rest ?? 0;
  // When the rows change under a reader scrolled into the list (a hymn opened
  // from it joins Recent above), the rows in view keep their place. At the
  // list's top nothing holds, so a list that gains a hymn shows it.
  const anchoring = useMemo(
    () => ({ data: true, shouldRestorePosition: () => scroll.value > rest + 1 }),
    [scroll, rest],
  );
  return (
    <View style={styles.fill}>
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
        ListHeaderComponent={pullDown?.node}
        estimatedHeaderSize={pullDown?.height}
        // The last row ends clear of the home indicator and the docked bar.
        ListFooterComponent={<ListEnd />}
        // The list opens with the search field tucked under the title, and a
        // drag let go between there and the top settles at one or the other;
        // past the field it scrolls freely.
        initialScrollOffset={pullDown?.rest}
        snapToOffsets={pullDown && [0, pullDown.rest]}
        snapToEnd={false}
        maintainVisibleContentPosition={anchoring}
        sharedValues={{ scrollOffset: scroll }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        {...dismissal}
        ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
        extraData={look}
        renderItem={drawRow}
      />
      {topics.names.length > 0 && (
        <PinnedTopic
          names={topics.names}
          starts={topics.starts}
          height={topicHeight}
          scroll={scroll}
        />
      )}
    </View>
  );
}

const names = (row: Row<HymnText>): ReadonlyArray<string> => {
  if (row.kind === 'topic') return [row.name];
  return [];
};

/**
 * The topic row pinned at the list's top: every topic's row stacked in a
 * strip one row tall, moved on the UI thread so the topic whose hymns pass
 * under the top shows, pushed up as the next topic's row meets it. Screen
 * readers read the list's own topic rows, so the copy is hidden from them,
 * and touches pass through it to the list.
 */
function PinnedTopic({
  names: topics,
  starts,
  height,
  scroll,
}: {
  readonly names: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
  readonly height: number;
  readonly scroll: SharedValue<number>;
}) {
  const pinned = useDerivedValue(() => pinnedAt(starts, scroll.value, height));
  const place = useAnimatedStyle(() => ({
    opacity: Math.min(1, pinned.value.index + 1),
    transform: [{ translateY: pinned.value.y }],
  }));
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, pinned.value.index) * height }],
  }));
  return (
    <View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pin, { height }]}
    >
      <Animated.View style={[{ height }, styles.clip, place]}>
        <Animated.View style={strip}>
          {topics.map((name, i) => (
            // A topic that comes back has the same name: its place is its key.
            <Topic key={i} name={name} height={height} />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
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

/**
 * One hymn's row: a link the router opens in the app. Its press first hands
 * the pager the list it sits in (`source`: its shelf's, or the list's), so a
 * swipe on the hymn moves through that list. A favourite's row draws a
 * small star before its title, and its name ends `, favourite`.
 */
function HymnRow({
  hymn,
  href,
  source,
  favourite,
  height,
  accent,
}: {
  readonly hymn: HymnText;
  readonly href: Href;
  readonly source: ReadonlyArray<number>;
  readonly favourite: boolean;
  readonly height: number;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href: Link.resolveHref(href) });
  const pageFrom = useAtomSet(pagesFrom);
  const onPress: typeof link.onPress = (event) => {
    pageFrom(Option.some(source));
    link.onPress(event);
  };
  return (
    <Pressable {...link} onPress={onPress} aria-label={nameOf(hymn, favourite)}>
      {({ pressed }) => (
        <View style={[styles.row, { height }, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
            {hymn.number}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {favourite && (
              <Text testID="row-star" style={[styles.star, { color: accent }]}>
                {'★\u2009'}
              </Text>
            )}
            {hymn.title}
          </Text>
          <View style={styles.separator} />
        </View>
      )}
    </Pressable>
  );
}

/** A hymn row's name as VoiceOver reads it: its number and title, and `favourite` when it is one. */
const nameOf = (hymn: HymnText, favourite: boolean) => {
  if (favourite) return `${hymn.number}, ${hymn.title}, favourite`;
  return `${hymn.number}, ${hymn.title}`;
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pin: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
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
  star: { fontSize: 13 },
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
