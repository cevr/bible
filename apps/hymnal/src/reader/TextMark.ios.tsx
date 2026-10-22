/** The reading button's mark on iOS: the SF Symbol `textformat.size` (a small and a large A), in the accent. */

import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

export function TextMark() {
  const accent = useAccent();
  return (
    <One.iOS.Image
      systemName="textformat.size"
      swiftStyle={{ foregroundStyle: accent, imageScale: 'large' }}
      style={styles.mark}
    />
  );
}

const styles = StyleSheet.create({ mark: { width: 28, height: 28 } });
