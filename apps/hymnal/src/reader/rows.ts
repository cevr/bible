/**
 * The phones' hymn list as rows: first each of the reader's own lists that
 * holds a hymn (`shelves`: Recent), under a header row that names it and
 * opens its own screen (`href`); then each run of hymns in one topic, under
 * a row that names the topic.
 * The list pins a topic's row at its top while its hymns scroll under it
 * (`sticky`, the topic rows' indices). A shelf's header is not pinned: the
 * pinned copy lets touches through to the list, so a pinned header could not
 * take a press.
 *
 * A row's place comes from the hymns' own order alone: a topic that comes
 * back after another gets a second row, keyed by its own first hymn. A hymn
 * row carries the hymns a press on it pages through (`source`): its shelf's,
 * or every hymn of the list under the topics. A hymn row of one of the
 * reader's `favourites` is starred (`favourite`), wherever it shows.
 */

import type { Shelf } from './lists';

export type Row<Hymn> =
  | { readonly kind: 'topic'; readonly key: string; readonly name: string }
  | { readonly kind: 'shelf'; readonly key: string; readonly name: string; readonly href: string }
  | {
      readonly kind: 'hymn';
      readonly key: string;
      readonly hymn: Hymn;
      readonly source: ReadonlyArray<number>;
      readonly favourite: boolean;
    };

export interface Rows<Hymn> {
  readonly rows: ReadonlyArray<Row<Hymn>>;
  /** The index of every topic row, ascending. */
  readonly sticky: ReadonlyArray<number>;
}

/** No favourites: a list drawn without the reader's lists. */
const none: ReadonlySet<number> = new Set();

export const rowsOf = <Hymn extends { readonly number: number; readonly topic: string }>(
  hymns: ReadonlyArray<Hymn>,
  shelves: ReadonlyArray<Shelf<Hymn>> = [],
  favourites: ReadonlySet<number> = none,
): Rows<Hymn> => {
  const rows: Array<Row<Hymn>> = [];
  const sticky: Array<number> = [];
  for (const shelf of shelves.filter((s) => s.hymns.length > 0)) {
    const source = shelf.hymns.map((hymn) => hymn.number);
    rows.push({ kind: 'shelf', key: `list:${shelf.name}`, name: shelf.name, href: shelf.href });
    for (const hymn of shelf.hymns)
      rows.push({
        kind: 'hymn',
        key: `${shelf.name}:${hymn.number}`,
        hymn,
        source,
        favourite: favourites.has(hymn.number),
      });
  }
  const source = hymns.map((hymn) => hymn.number);
  hymns.forEach((hymn, i) => {
    if (hymns[i - 1]?.topic !== hymn.topic) {
      sticky.push(rows.length);
      rows.push({ kind: 'topic', key: `topic:${hymn.number}`, name: hymn.topic });
    }
    rows.push({
      kind: 'hymn',
      key: `hymn:${hymn.number}`,
      hymn,
      source,
      favourite: favourites.has(hymn.number),
    });
  });
  return { rows, sticky };
};

/** A list with no topic rows, such as a search's results: a row per hymn, each paging through them all. */
export const plainRowsOf = <Hymn extends { readonly number: number }>(
  hymns: ReadonlyArray<Hymn>,
  favourites: ReadonlySet<number> = none,
): Rows<Hymn> => {
  const source = hymns.map((hymn) => hymn.number);
  return {
    rows: hymns.map((hymn): Row<Hymn> => ({
      kind: 'hymn',
      key: `hymn:${hymn.number}`,
      hymn,
      source,
      favourite: favourites.has(hymn.number),
    })),
    sticky: [],
  };
};
