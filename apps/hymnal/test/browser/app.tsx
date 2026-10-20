/* oxlint-disable effect/noTernary -- the browser test's app, a host boundary: a small router over the History API, which gives paths as plain strings. */

/**
 * The web app as the browser test drives it: the real Hymns and Search
 * screens (`app/(tabs)/…/index.tsx`) under a tab bar, and a hymn opened from
 * a row in its list's place, under a header whose back link goes to the
 * list, as One's web stacks and `WebStackHeader` and `WebTabBar` show them.
 * A route is a path:
 * - `/` the Hymns list, `/search` the Search list;
 * - `/hymns/<n>` and `/search/<n>` a hymn, opened from that list.
 * Each link (a row, a tab, the back link) pushes its path, and the
 * browser's Back pops it, so every way back to a list mounts it anew, as on
 * the web. The same tree renders on the server (`server.tsx`) and hydrates
 * in the browser (`page.tsx`).
 */

import { RegistryProvider } from '@effect/atom-react';
import { useLinkTo } from 'one';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Hymns from '../../app/(tabs)/(hymns)/index';
import Search from '../../app/(tabs)/search/index';
import { opening } from '../../src/test/one';
import { color } from '~/color';

import { listOf, lists } from './routes';

/** A link, as One's `Link` draws one on the web: an anchor the router opens. */
function Go({ href, label }: { readonly href: string; readonly label: string }) {
  const link = useLinkTo({ href });
  return (
    <Pressable {...link} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

function Screen({ path }: { readonly path: string }) {
  const list = lists[listOf(path)];
  if (path === list.path) {
    return (
      <View style={styles.window}>
        <Text role="heading" aria-level={1} style={styles.title}>
          {list.title}
        </Text>
        <View style={styles.content}>{list === lists.hymns ? <Hymns /> : <Search />}</View>
      </View>
    );
  }
  return (
    <View style={styles.window}>
      <Go href={list.path} label={`‹ ${list.title}`} />
      <Text role="heading" aria-level={1} style={styles.title}>
        {`Hymn ${path.split('/').at(-1)}`}
      </Text>
    </View>
  );
}

export function App({ path: initial }: { readonly path: string }) {
  const [path, setPath] = useState(initial);
  useEffect(() => {
    const open = (href: string) => {
      history.pushState({}, '', href);
      setPath(href);
    };
    const popped = () => setPath(location.pathname);
    opening.add(open);
    addEventListener('popstate', popped);
    return () => {
      opening.delete(open);
      removeEventListener('popstate', popped);
    };
  }, []);
  return (
    <RegistryProvider>
      <View style={styles.window}>
        <View style={styles.content}>
          <Screen key={path} path={path} />
        </View>
        <View role="navigation" style={styles.bar}>
          <Go href={lists.hymns.path} label={lists.hymns.title} />
          <Go href={lists.search.path} label={lists.search.title} />
        </View>
      </View>
    </RegistryProvider>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 0 },
  content: { flex: 1, minHeight: 0 },
  title: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 28, fontWeight: '700' },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.line },
  link: { flex: 1, paddingVertical: 12, paddingHorizontal: 16 },
  linkText: { fontSize: 15, color: color.ink },
});
