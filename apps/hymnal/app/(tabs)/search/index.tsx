import { Stack } from 'one';
import { useDeferredValue, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { hymns } from '~/hymns/hymns';
import { indexOf, search } from '~/hymns/search';
import { HymnList } from '~/reader/HymnList';
import { SearchField } from '~/web/SearchField';

const index = indexOf(hymns);
const label = 'Number, title or first line';

export default function Search() {
  const [query, setQuery] = useState('');
  const shown = useDeferredValue(query);
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: label,
            autoCapitalize: 'none',
            hideWhenScrolling: false,
            onChange: (event) => setQuery(event.nativeEvent.text),
          },
        }}
      />
      <SearchField label={label} onChangeText={setQuery} />
      <HymnList
        hymns={search(index, shown)}
        hrefOf={(n) => `/search/${n}`}
        empty={`No hymn matches “${shown}”.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
