/**
 * The web's search: its field over the hymns its query finds, each opening
 * at `hrefOf(number)`. While the field is empty it shows `idle` (the home
 * screen's whole list), or every hymn when it has none. The query and the
 * results' scroll offset live in the app's registry (`place.ts`), so a search
 * mounted anew comes back as the reader left it.
 */

import { useAtom } from '@effect/atom-react';
import type { Href } from 'one';
import { type ReactNode, useDeferredValue } from 'react';
import { StyleSheet, View } from 'react-native';

import { hymns } from '~/hymns/hymns';
import { indexOf, search } from '~/hymns/search';
import { HymnList } from '~/reader/HymnList';
import { searchOffset, searchQuery } from '~/reader/place';
import { SearchField } from '~/web/SearchField';

const index = indexOf(hymns);

/** The search field's label and placeholder. */
export const searchLabel = 'Number, title or first line';

export function Results({
  hrefOf,
  idle,
}: {
  readonly hrefOf: (number: number) => Href;
  readonly idle?: ReactNode;
}) {
  const [query, setQuery] = useAtom(searchQuery);
  const shown = useDeferredValue(query);
  return (
    <View style={styles.screen}>
      <SearchField label={searchLabel} value={query} onChangeText={setQuery} />
      {(shown === '' && idle) || (
        <HymnList
          hymns={search(index, shown)}
          hrefOf={hrefOf}
          offset={searchOffset}
          empty={`No hymn matches “${shown}”.`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, minHeight: 0 } });
