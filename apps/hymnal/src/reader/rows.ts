/**
 * The phones' hymn list as rows: each run of hymns in one topic, under a row
 * that names the topic. The list pins a topic row at its top while that
 * topic's hymns scroll under it (`sticky`, the topic rows' indices).
 *
 * A row's place comes from the hymns' own order alone: a topic that comes
 * back after another gets a second row, keyed by its own first hymn.
 */

export type Row<Hymn> =
  | { readonly kind: 'topic'; readonly key: string; readonly name: string }
  | { readonly kind: 'hymn'; readonly key: string; readonly hymn: Hymn };

export interface Rows<Hymn> {
  readonly rows: ReadonlyArray<Row<Hymn>>;
  /** The index of every topic row, ascending. */
  readonly sticky: ReadonlyArray<number>;
}

export const rowsOf = <Hymn extends { readonly number: number; readonly topic: string }>(
  hymns: ReadonlyArray<Hymn>,
): Rows<Hymn> => {
  const rows: Array<Row<Hymn>> = [];
  const sticky: Array<number> = [];
  for (const hymn of hymns) {
    const last = rows.at(-1);
    if (last?.kind !== 'hymn' || last.hymn.topic !== hymn.topic) {
      sticky.push(rows.length);
      rows.push({ kind: 'topic', key: `topic:${hymn.number}`, name: hymn.topic });
    }
    rows.push({ kind: 'hymn', key: `hymn:${hymn.number}`, hymn });
  }
  return { rows, sticky };
};
