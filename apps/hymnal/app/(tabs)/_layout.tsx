import { Tabs } from 'one';
import { Platform } from 'react-native';

import { useAccent } from '~/color';
import { type WebTab, WebTabBar } from '~/web/WebTabBar';
import { webOnly } from '~/web/webOnly';

const hymns = { name: '(hymns)', title: 'Hymns', href: '/' } as const satisfies WebTab;
const search = { name: 'search', title: 'Search', href: '/search' } as const satisfies WebTab;
const settings = {
  name: 'settings',
  title: 'Settings',
  href: '/settings',
} as const satisfies WebTab;

/**
 * The system tab bar on a phone (iOS 26's glass bar, Android's navigation
 * bar); on the web, One draws no bar, so `WebTabBar` draws a small one.
 */
export default function TabsLayout() {
  const accent = useAccent();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarMinimizeBehavior: 'onScrollDown',
      }}
    >
      <Tabs.Screen
        name={hymns.name}
        options={{
          title: hymns.title,
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol', name: 'music.note.list' },
            default: { type: 'materialSymbol', name: 'queue_music' },
          }),
        }}
      />
      <Tabs.Screen
        name={search.name}
        options={{
          title: search.title,
          // The system search tab (iOS 26.1+): the bar becomes the search field.
          tabBarRole: 'search',
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol', name: 'magnifyingglass' },
            default: { type: 'materialSymbol', name: 'search' },
          }),
        }}
      />
      <Tabs.Screen
        name={settings.name}
        options={{
          title: settings.title,
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol', name: 'gearshape' },
            default: { type: 'materialSymbol', name: 'settings' },
          }),
        }}
      />
      {webOnly(<WebTabBar tabs={[hymns, search, settings]} />)}
    </Tabs>
  );
}
