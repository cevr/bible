/**
 * The web's tab bar. One's web tabs are headless, so this draws the focused
 * tab and a bar of links under it, one per tab the layout names; on a phone
 * the system bar is used and this is never rendered.
 */

import { type Href, Link, useTabs } from 'one';
import { StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';

export interface WebTab {
  /** The tab's route segment, as its `Tabs.Screen` names it. */
  readonly name: string;
  readonly title: string;
  readonly href: Href;
}

export function WebTabBar({ tabs }: { readonly tabs: ReadonlyArray<WebTab> }) {
  const { focused } = useTabs();
  const accent = useAccent();
  return (
    <View style={styles.window}>
      <View style={styles.content}>{focused.element}</View>
      <View role="navigation" style={styles.bar}>
        {tabs.map((tab) => {
          const current = tab.name === focused.name;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              aria-current={current && 'page'}
              style={[styles.tab, current && { color: accent }]}
            >
              {tab.title}
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 0, backgroundColor: color.background },
  content: { flex: 1, minHeight: 0 },
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    textAlign: 'center',
    textDecorationLine: 'none',
    fontSize: 13,
    fontWeight: '600',
    color: color.secondaryLabel,
  },
});
