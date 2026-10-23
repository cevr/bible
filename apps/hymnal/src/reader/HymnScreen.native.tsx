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
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { LegendList } from '@legendapp/list/react-native';
import { Option } from 'effect';
import { useParams, useRouter } from 'one';
import { useEffect, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { hymnAt, type HymnText, hymns } from '~/hymns/hymns';

import { HymnPage, NoHymn } from './HymnPage';
import { onPage, pageSource, settledAt } from './pager';
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
    <>
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
        extraData={width}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        renderItem={drawPage}
        style={styles.pager}
      />
    </>
  );
}

/** One hymn's page, a screen wide. */
const drawPage = ({ item, extraData }: { readonly item: number; readonly extraData: number }) => (
  <View style={[styles.page, { width: extraData }]}>
    {Option.match(hymnAt(String(item)), {
      onNone: () => <NoHymn number={String(item)} />,
      onSome: (hymn) => <HymnPage hymn={hymn} reader={reader} />,
    })}
  </View>
);

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { flex: 1 },
});
