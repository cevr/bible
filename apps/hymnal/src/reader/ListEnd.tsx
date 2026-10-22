/**
 * The space a list keeps after its last row (`endSpace`), from the bottom
 * inset the list meets (`useStackBottom`): over the home indicator with no
 * bar, over the docked bar while it shows. Only this space draws again when
 * the bar shows or hides.
 */

import { View } from 'react-native';

import { useStackBottom } from '~/player/StackBottom';

import { endSpace } from './end';

export function ListEnd() {
  return <View testID="list-end" style={{ height: endSpace(useStackBottom()) }} />;
}
