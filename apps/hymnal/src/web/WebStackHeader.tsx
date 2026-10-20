/**
 * The web's header for a tab's stack. One's web stacks are headless, so this
 * draws the stack's title over its first screen and, on any screen pushed
 * over it, a back link to it (that screen carries its own heading). On a
 * phone the native header is used and this is never rendered.
 */

import { type Href, Link, useStack } from 'one';
import { StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';

export function WebStackHeader({ root, title }: { readonly root: Href; readonly title: string }) {
  const { focused } = useStack();
  return (
    <View style={styles.window}>
      <View style={styles.header}>
        <Heading atRoot={focused.name === 'index'} root={root} title={title} />
      </View>
      <View style={styles.content}>{focused.element}</View>
    </View>
  );
}

function Heading({
  atRoot,
  root,
  title,
}: {
  readonly atRoot: boolean;
  readonly root: Href;
  readonly title: string;
}) {
  const accent = useAccent();
  if (atRoot) {
    return (
      <Text role="heading" aria-level={1} style={styles.title}>
        {title}
      </Text>
    );
  }
  return (
    <Link href={root} style={[styles.back, { color: accent }]}>
      ‹ {title}
    </Link>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  back: { fontSize: 17, textDecorationLine: 'none' },
  title: { fontSize: 28, fontWeight: '700', color: color.label },
  content: { flex: 1, minHeight: 0 },
});
