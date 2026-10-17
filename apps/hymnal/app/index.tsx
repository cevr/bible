import { useAtom } from '@effect/atom-react';
import { Switch, Text, View } from 'react-native';
import { chordsAtom } from '~/settings';

export default function Index() {
  const [chords, setChords] = useAtom(chordsAtom);
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text>Chords</Text>
      <Switch value={chords} onValueChange={setChords} />
    </View>
  );
}
