// The tab's title the lab's shell prints (`page-shell.tsx`), and the pages
// the shell is around. Pure.

import { Array as Arr, Option } from 'effect';

/** The pages in the lab's shell: Films (the home and what sits under it) and a film's pages the studio has not taken in yet. */
export type ShellPage = 'films' | 'board' | 'lab' | 'script' | 'choices';

/** Each shell page's name, as its header and its tab's title say it. */
export const PAGE_TITLE: Readonly<Record<ShellPage, string>> = {
  films: 'Films',
  board: 'Board',
  lab: 'Lab',
  script: 'Script',
  choices: 'Choices',
};

/**
 * A page's title, naming where it is as the header does: what it has
 * selected, its depth, its page and its film (`Choices ·
 * righteousness-by-faith`, `woman · Board · …`, `Films`). A film the names
 * before it already say is not said again.
 */
export const pageTitle = (
  names: ReadonlyArray<Option.Option<string>>,
  page: ShellPage,
  film: Option.Option<string>,
): string => {
  const said = Arr.getSomes(names);
  return [
    ...said,
    PAGE_TITLE[page],
    ...Option.toArray(Option.filter(film, (f) => !said.includes(f))),
  ].join(' · ');
};
