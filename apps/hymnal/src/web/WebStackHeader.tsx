/**
 * The web's header for the app's stack. One's web stacks are headless, so
 * this draws, on any screen over the stack's first, a back link to it (that
 * screen carries its own heading); the first screen draws its own title. On
 * a phone the native header is used and this is never rendered.
 */

import { type Href, Link, useStack } from 'one';
import { StyleSheet, View } from 'react-native';

import { useAccent } from '~/color';

export function WebStackHeader({ root, title }: { readonly root: Href; readonly title: string }) {
  const { focused } = useStack();
  return (
    <View style={styles.window}>
      {focused.name !== 'index' && <Back root={root} title={title} />}
      <View style={styles.content}>{focused.element}</View>
    </View>
  );
}

function Back({ root, title }: { readonly root: Href; readonly title: string }) {
  const accent = useAccent();
  return (
    <View style={styles.header}>
      <Link href={root} style={[styles.back, { color: accent }]}>
        ‹ {title}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  back: { fontSize: 17, textDecorationLine: 'none' },
  content: { flex: 1, minHeight: 0 },
});
