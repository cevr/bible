/**
 * A phone's home screen: the title "Hymns" and a settings button over the
 * hymn list, with the search field pulled down from under the title, as
 * iOS's search controller hides its field.
 *
 * The list's content is a spacer the title's height, the field, then the
 * rows; the list opens scrolled by the field's height, so the field rests
 * under the title, which is a layer over the list on the ground. On the UI
 * thread the title follows the list's offset: it stays put while the list
 * is between its top and the field's height (a pull brings the field out
 * under it), moves up with the rows past that, and follows a pull past the
 * top down. The title's text takes no touch, so a drag that starts on it
 * scrolls the list.
 *
 * Tapping the field enters search mode: a bar with the focused text field
 * and Cancel, over the results. The list stays mounted beneath, untouchable
 * and hidden from assistive technology, so it keeps its place. Cancel, or
 * Android's Back while the home screen is in focus (`searchBack`), clears
 * the query and shows the list as it was.
 */

import { useAtom } from '@effect/atom-react';
import { Link, useLinkTo, useNavigation, useSafeAreaInsets } from 'one';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { hymns } from '~/hymns/hymns';
import { indexOf, search } from '~/hymns/search';
import { HymnList } from '~/reader/HymnList';
import { searchOffset, searchQuery } from '~/reader/place';
import { color, useAccent } from '~/color';

import { searchBack } from './back';
import { Browse } from './Browse';
import { Gear } from './Gear';
import { searchLabel } from './Results';

const index = indexOf(hymns);

/** The list beneath search mode: kept in place, untouchable and unseen by assistive technology. */
const underSearch = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** The title row's line (a large title) and the space under it, at the reader's usual text size. */
const titleLine = 41;
const titleSpace = 8;

/** The field's line and the space around its text and around the field. */
const fieldLine = 22;
const fieldPadding = 7;
const fieldMargin = 8;

export function Home() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [searching, setSearching] = useState(false);
  const title = Math.ceil(titleLine * fontScale) + titleSpace;
  const field = Math.ceil(fieldLine * fontScale) + 2 * fieldPadding + 2 * fieldMargin;
  const scroll = useSharedValue(field);
  return (
    <View style={styles.screen}>
      <View style={[styles.below, { marginTop: insets.top }]}>
        <View style={styles.fill} {...(searching && underSearch)}>
          <Browse
            pullDown={{
              node: (
                <View style={{ height: title + field }}>
                  <View style={{ height: title }} />
                  <FieldButton height={field} onPress={() => setSearching(true)} />
                </View>
              ),
              height: title + field,
              rest: field,
              scroll,
            }}
          />
          <Title height={title} rest={field} scroll={scroll} />
        </View>
        {searching && <Search onCancel={() => setSearching(false)} />}
      </View>
      {/* The status bar's ground: rows and the title pass under it unseen. */}
      <View style={[styles.scrim, { height: insets.top }]} />
    </View>
  );
}

/** The title and the settings button, moved with the list's offset. */
function Title({
  height,
  rest,
  scroll,
}: {
  readonly height: number;
  readonly rest: number;
  readonly scroll: SharedValue<number>;
}) {
  const settings = useLinkTo({ href: Link.resolveHref('/settings') });
  const moved = useAnimatedStyle(() => {
    'worklet';
    const y = scroll.value;
    if (y < 0) return { transform: [{ translateY: -y }] };
    if (y > rest) return { transform: [{ translateY: rest - y }] };
    return { transform: [{ translateY: 0 }] };
  });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.title, { height }, moved]}>
      <View pointerEvents="none" style={styles.titleText}>
        <Text role="heading" aria-level={1} style={styles.titleWords} numberOfLines={1}>
          Hymns
        </Text>
      </View>
      <Pressable
        {...settings}
        role="button"
        aria-label="Settings"
        hitSlop={8}
        style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
      >
        <Gear />
      </Pressable>
    </Animated.View>
  );
}

/** The search field as the list holds it: a button drawn as a field, which enters search mode. */
function FieldButton({
  height,
  onPress,
}: {
  readonly height: number;
  readonly onPress: () => void;
}) {
  return (
    <View style={[styles.fieldFrame, { height }]}>
      <Pressable
        role="button"
        aria-label={searchLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Text style={styles.placeholder} numberOfLines={1}>
          {searchLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/** Search mode: the focused field and Cancel over the hymns the query finds. */
function Search({ onCancel }: { readonly onCancel: () => void }) {
  const [query, setQuery] = useAtom(searchQuery);
  const shown = useDeferredValue(query);
  const accent = useAccent();
  const cancel = () => {
    setQuery('');
    Keyboard.dismiss();
    onCancel();
  };
  const navigation = useNavigation();
  useEffect(() => {
    const back = BackHandler.addEventListener(
      'hardwareBackPress',
      searchBack({ isFocused: () => navigation.isFocused(), cancel }),
    );
    return () => back.remove();
  }, []);
  return (
    <View style={styles.search}>
      <View style={styles.bar}>
        <TextInput
          autoFocus
          role="searchbox"
          aria-label={searchLabel}
          placeholder={searchLabel}
          placeholderTextColor={color.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.field, styles.input]}
        />
        <Pressable role="button" onPress={cancel} hitSlop={8} style={styles.cancel}>
          <Text style={[styles.cancelWords, { color: accent }]}>Cancel</Text>
        </Pressable>
      </View>
      {shown !== '' && (
        // A new query's results open at their top.
        <HymnList
          key={shown}
          hymns={search(index, shown)}
          hrefOf={(n) => `/hymns/${n}`}
          offset={searchOffset}
          empty={`No hymn matches “${shown}”.`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  below: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.ground },
  title: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: color.ground,
  },
  titleText: { flex: 1 },
  titleWords: { fontSize: 34, lineHeight: titleLine, fontWeight: '700', color: color.ink },
  settings: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { opacity: 0.6 },
  fieldFrame: { paddingHorizontal: 16, paddingVertical: fieldMargin },
  field: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: fieldPadding,
    borderRadius: 10,
    backgroundColor: color.soft,
  },
  placeholder: { fontSize: 17, lineHeight: fieldLine, color: color.muted },
  search: { ...StyleSheet.absoluteFill, backgroundColor: color.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: fieldMargin,
  },
  input: { fontSize: 17, lineHeight: fieldLine, color: color.ink },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelWords: { fontSize: 17 },
});
