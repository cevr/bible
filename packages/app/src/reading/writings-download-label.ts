/**
 * The accessible name of a per-publication download control. Naming the title
 * and the code keeps the buttons distinguishable when several rows show the
 * same action word.
 *
 * It sits beside `writings-reader`, its only caller, rather than inside it,
 * because the reader is a `.tsx` module and the bun test environment compiles
 * no JSX runtime — a plain module is what lets the rule be tested at all.
 */
export const writingsDownloadLabel = (
  action: 'Download' | 'Retry',
  title: string,
  code: string,
): string => `${action} ${title} (${code})`;
