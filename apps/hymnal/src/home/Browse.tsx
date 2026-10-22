/**
 * Every hymn in number order, each opening at `/hymns/<n>`: the home
 * screen's list while no search is typed. On a phone a row names each topic
 * over its hymns (`byTopic`), and `pullDown` holds the search field above
 * the rows; the web draws neither.
 */

import { hymns } from '~/hymns/hymns';
import { HymnList, type PullDown } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

export function Browse({ pullDown }: { readonly pullDown?: PullDown }) {
  return (
    <HymnList
      hymns={hymns}
      hrefOf={(n) => `/hymns/${n}`}
      offset={hymnsOffset}
      byTopic
      pullDown={pullDown}
    />
  );
}
