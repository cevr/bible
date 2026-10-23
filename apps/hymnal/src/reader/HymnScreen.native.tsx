/**
 * The hymn route's screen on a phone, pushed over the home screen from its
 * list or its search: a pager of hymn pages a reader swipes left or right
 * through. It pages through the list the reader pressed the hymn's row in
 * (`pagesFrom`), else through every hymn in number order (`pageSource`), and
 * the ends do not wrap.
 *
 * Every page is one screen wide (`getFixedItemSize`), so the pager opens at
 * the hymn's page on its first frame (`initialScrollIndex`), even at hymn
 * 600, and draws one page on each side of the one shown. A page scrolls up
 * and down on its own; the pager moves only sideways.
 *
 * The route follows the page the pager settles on (`settledAt`), never a
 * page passed mid-swipe: the screen sets the route's number in place
 * (`setParams`, no push), so Back returns to the list in one step. The
 * header follows the route's number where the stack is laid out
 * (`hymnHeader`), and the screen, not its pages, tells the bottom bar the
 * page shown (`Shown`): a neighbour page sets nothing, and a swipe never
 * touches the player.
 *
 * A pan that starts at the screen's left edge pops the screen, as on every
 * other pushed screen: a strip `backEdge` points wide lies over the pager
 * there, so the pager's scroll view never gets that touch, and the stack's
 * back gesture does. A pan that starts anywhere else turns the page.
 *
 * LegendList lays each item of a sideways list in a box as tall as the
 * item's own content, so a page given only `flex: 1` grows to its words'
 * full height and its scroll view has nothing to scroll. Each page is
 * therefore given the pager's measured height (`onLayout`).
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { LegendList } from '@legendapp/list/react-native';
import { Option } from 'effect';
import { useParams, useRouter } from 'one';
import { useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { hymnAt, type HymnText, hymns } from '~/hymns/hymns';

import { HymnPage, NoHymn } from './HymnPage';
import { backEdge, onPage, pageSource, settledAt } from './pager';
import { pagesFrom } from './place';
import { reader, Shown } from './screen';

export { hymnParams } from './screen';

/** Every hymn's number, in order: the pages of a hymn opened from no list. */
const everyHymn = hymns.map((hymn) => hymn.number);

export function HymnScreen() {
  const { number } = useParams<{ number: string }>();
  const asked = String(number);
  return Option.match(hymnAt(asked), {
    onNone: () => <NoHymn number={asked} />,
    onSome: (hymn) => <Pager shown={hymn} />,
  });
}

/** The pages around `shown`, the route's hymn, and the bar told of it alone. */
function Pager({ shown }: { readonly shown: HymnText }) {
  const from = useAtomValue(pagesFrom);
  const [pages] = useState(() => pageSource(from, shown.number, everyHymn));
  const taken = useAtomSet(pagesFrom);
  // The list a row handed over is this screen's alone: a hymn opened next by
  // a link pages through every hymn.
  useEffect(() => taken(Option.none()), [taken]);
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(Option.none<number>());
  const onLayout = (event: LayoutChangeEvent) =>
    setHeight(Option.some(event.nativeEvent.layout.height));
  const router = useRouter();
  const settle = (offset: number) =>
    Option.match(
      Option.filter(settledAt(offset, width, pages.list), (n) => n !== shown.number),
      {
        onNone: () => {},
        onSome: (n) => router.setParams({ number: String(n) }),
      },
    );
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(event.nativeEvent.contentOffset.x);
  // A drag let go on a page's edge glides no further, so no glide's end tells it.
  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Option.match(
      Option.liftPredicate(event.nativeEvent.contentOffset.x, (x) => onPage(x, width)),
      { onNone: () => {}, onSome: settle },
    );
  return (
    <View style={styles.screen} onLayout={onLayout}>
      <Shown hymn={shown} />
      <LegendList
        data={pages.list}
        keyExtractor={String}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getFixedItemSize={() => width}
        estimatedItemSize={width}
        initialScrollIndex={pages.index}
        drawDistance={width}
        extraData={{ width, height }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        renderItem={drawPage}
        style={styles.pager}
      />
      <View testID="back-edge" style={styles.backEdge} />
    </View>
  );
}

/** One hymn's page, a screen wide. */
const drawPage = ({
  item,
  extraData,
}: {
  readonly item: number;
  readonly extraData: { readonly width: number; readonly height: Option.Option<number> };
}) => (
  <View
    testID="pager-page"
    style={[
      styles.page,
      { width: extraData.width },
      Option.match(extraData.height, { onNone: () => ({}), onSome: (height) => ({ height }) }),
    ]}
  >
    {Option.match(hymnAt(String(item)), {
      onNone: () => <NoHymn number={String(item)} />,
      onSome: (hymn) => <HymnPage hymn={hymn} reader={reader} />,
    })}
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pager: { flex: 1 },
  backEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: backEdge },
  page: { flex: 1 },
});
