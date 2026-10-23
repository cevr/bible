/**
 * Every hymn in number order, each opening at `/hymns/<n>`: the home
 * screen's list while no search is typed. On a phone a row names each topic
 * over its hymns (`byTopic`), the reader's Favourites and Recent sit above
 * the topics while they hold a hymn (`shelves`), and `pullDown` holds the
 * search field above the rows; the web draws none of them.
 */

import { useAtomValue } from '@effect/atom-react';
import type { Href } from 'one';
import { useMemo } from 'react';

import { hymnAt, hymns } from '~/hymns/hymns';
import { HymnList, type PullDown } from '~/reader/HymnList';
import { shelvesOf } from '~/reader/lists';
import { hymnsOffset } from '~/reader/place';
import { settings } from '~/store';

/** One function for every render, so the rows are drawn again only when what they show changes. */
const hymnHref = (n: number): Href => `/hymns/${n}`;

/** The hymn numbered `n`, if there is one. */
const hymnOf = (n: number) => hymnAt(String(n));

export function Browse({ pullDown }: { readonly pullDown?: PullDown }) {
  const favourites = useAtomValue(settings.lists.favourites);
  const recent = useAtomValue(settings.lists.recent);
  const shelves = useMemo(() => shelvesOf({ favourites, recent }, hymnOf), [favourites, recent]);
  return (
    <HymnList
      hymns={hymns}
      hrefOf={hymnHref}
      offset={hymnsOffset}
      byTopic
      shelves={shelves}
      pullDown={pullDown}
    />
  );
}
