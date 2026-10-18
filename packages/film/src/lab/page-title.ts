// The tab's title the lab's shell prints (`page-shell.tsx`). Pure.

import { Array as Arr, Option } from 'effect';

/**
 * A page's title, naming where it is as the header does: what it has
 * selected, its depth, Films and its film (`Films · righteousness-by-faith`,
 * `cold · stack · Films · …`, `Films`). A film the names before it already
 * say is not said again.
 */
export const pageTitle = (
  names: ReadonlyArray<Option.Option<string>>,
  film: Option.Option<string>,
): string => {
  const said = Arr.getSomes(names);
  return [...said, 'Films', ...Option.toArray(Option.filter(film, (f) => !said.includes(f)))].join(
    ' · ',
  );
};
