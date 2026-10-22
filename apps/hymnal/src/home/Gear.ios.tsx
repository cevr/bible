/** The settings button's mark on iOS: the SF Symbol `gearshape`, in the accent. */

import { One } from 'one';
import { StyleSheet } from 'react-native';

import { useAccent } from '~/color';

export function Gear() {
  const accent = useAccent();
  return (
    <One.iOS.Image
      systemName="gearshape"
      swiftStyle={{ foregroundStyle: accent, imageScale: 'large' }}
      style={styles.gear}
    />
  );
}

const styles = StyleSheet.create({ gear: { width: 28, height: 28 } });
