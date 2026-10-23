/**
 * The pill a hand scroll shows over a followed hymn page: a press scrolls
 * back to the sung line and follows again. It floats at the page's foot on
 * the ground with a hairline, so the button reads over the hymn's words on
 * every platform (on iOS the button is its title alone, with no fill).
 */

import { StyleSheet, View } from 'react-native';

import { color } from '~/color';
import { AccentButton } from '~/player/AccentButton';

export function ResumeFollow({ onPress }: { readonly onPress: () => void }) {
  return (
    <View pointerEvents="box-none" style={styles.dock}>
      <View style={styles.pill}>
        <AccentButton title="Resume follow" label="Resume follow" onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  pill: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: color.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
});
