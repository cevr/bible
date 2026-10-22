/**
 * The web's header for the app's stack. One's web stacks are headless, so
 * this draws, on any screen over the stack's first, a back link to it (that
 * screen carries its own heading) and the screen's own header buttons
 * (`headerRight`, as a phone's header draws them); the first screen draws
 * its own title. On
 * a phone the native header is used and this is never rendered.
 */

import { Option, Predicate } from 'effect';
import { type Href, Link, useStack } from 'one';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccent } from '~/color';

export function WebStackHeader({ root, title }: { readonly root: Href; readonly title: string }) {
  const { focused } = useStack();
  return (
    <View style={styles.window}>
      {focused.name !== 'index' && (
        <Back root={root} title={title} right={rightOf(focused.options)} />
      )}
      <View style={styles.content}>{focused.element}</View>
    </View>
  );
}

/** The screen's header buttons, from its `headerRight` option, if it has one. */
const rightOf = (options: { readonly headerRight?: unknown }): ReactNode =>
  Option.liftPredicate(options.headerRight, Predicate.isFunction).pipe(
    Option.map((right): ReactNode => right({})),
    Option.getOrElse((): ReactNode => <></>),
  );

function Back({
  root,
  title,
  right,
}: {
  readonly root: Href;
  readonly title: string;
  readonly right: ReactNode;
}) {
  const accent = useAccent();
  return (
    <View style={styles.header}>
      <Link href={root} style={[styles.back, { color: accent }]}>
        ‹ {title}
      </Link>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  back: { fontSize: 17, textDecorationLine: 'none' },
  content: { flex: 1, minHeight: 0 },
});
