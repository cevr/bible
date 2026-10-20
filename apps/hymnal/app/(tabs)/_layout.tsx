import { Option } from 'effect';
import { Tabs } from 'one';
import { Platform } from 'react-native';

import { useAccent } from '~/color';
import { LivePlayer } from '~/player/LivePlayer';
import { NowPlayingBar, useHolding } from '~/player/NowPlayingBar';
import { type WebTab, WebTabBar } from '~/web/WebTabBar';
import { webOnly } from '~/web/webOnly';

const hymns = { name: '(hymns)', title: 'Hymns', href: '/' } as const satisfies WebTab;
const search = { name: 'search', title: 'Search', href: '/search' } as const satisfies WebTab;
const settings = {
  name: 'settings',
  title: 'Settings',
  href: '/settings',
} as const satisfies WebTab;

/** The now-playing bar in the tab bar's accessory (iOS 26), there only while a hymn is held. */
const nowPlaying = () => <NowPlayingBar />;

/**
 * The system tab bar on a phone (iOS 26's glass bar, Android's navigation
 * bar); on the web, One draws no bar, so `WebTabBar` draws a small one. The
 * app's player plays on across every tab; the now-playing bar sits above
 * the tab bar.
 */
export default function TabsLayout() {
  return (
    <LivePlayer>
      <PlayerTabs />
    </LivePlayer>
  );
}

function PlayerTabs() {
  const accent = useAccent();
  const holding = useHolding();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarMinimizeBehavior: 'onScrollDown',
        bottomAccessory: Option.getOrUndefined(Option.liftPredicate(nowPlaying, () => holding)),
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
      {webOnly(
        <WebTabBar tabs={[hymns, search, settings]}>
          <NowPlayingBar />
        </WebTabBar>,
      )}
    </Tabs>
  );
}
