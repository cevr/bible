// The tab's title the studio's shell prints (`page-shell.tsx`). Pure.

import { Array as Arr, Option } from 'effect';
import { PART_TITLE, type Part } from '../core/api.ts';

/**
 * A page's title, naming where it is as the header does: what it has
 * selected, its depth, its part and its film (`Choices ·
 * righteousness-by-faith`, `woman · Scenes · …`, `woman · versions ·
 * Project · …`, `Films`). A film the names before it already say is not said
 * again (a folder named after its film is `righteousness-by-faith · Project`).
 */
export const pageTitle = (
  names: ReadonlyArray<Option.Option<string>>,
  part: Part,
  film: Option.Option<string>,
): string => {
  const said = Arr.getSomes(names);
  return [
    ...said,
    PART_TITLE[part],
    ...Option.toArray(Option.filter(film, (f) => !said.includes(f))),
  ].join(' · ');
};
