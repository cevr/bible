/**
 * The web's home screen: the title, a link to Settings, and the search
 * field over the whole list or what the search finds (`Results`).
 */

import { Link, useLinkTo } from 'one';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';

import { Browse } from './Browse';
import { Results } from './Results';

export function Home() {
  const accent = useAccent();
  const settings = useLinkTo({ href: Link.resolveHref('/settings') });
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text role="heading" aria-level={1} style={styles.title}>
          Hymns
        </Text>
        <Pressable {...settings} style={styles.settings}>
          <Text style={[styles.settingsText, { color: accent }]}>Settings</Text>
        </Pressable>
      </View>
      <Results hrefOf={(n) => `/hymns/${n}`} idle={<Browse />} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '700', color: color.ink },
  settings: { minHeight: 44, justifyContent: 'center' },
  settingsText: { fontSize: 17 },
});
