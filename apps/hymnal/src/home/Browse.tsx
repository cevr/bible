/**
 * Every hymn in number order, each opening at `/hymns/<n>`: the home
 * screen's list while no search is typed. On a phone a row names each topic
 * over its hymns (`byTopic`), and `pullDown` holds the search field above
 * the rows; the web draws neither.
 */

import type { Href } from 'one';

import { hymns } from '~/hymns/hymns';
import { HymnList, type PullDown } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

/** One function for every render, so the rows are drawn again only when what they show changes. */
const hymnHref = (n: number): Href => `/hymns/${n}`;

export function Browse({ pullDown }: { readonly pullDown?: PullDown }) {
  return (
    <HymnList hymns={hymns} hrefOf={hymnHref} offset={hymnsOffset} byTopic pullDown={pullDown} />
  );
}
