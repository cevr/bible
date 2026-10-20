/**
 * The hymnal the app reads: every hymn's words, bundled with the app
 * (`virtual:hymnal`, made by `vite/hymnal.ts`), so it opens offline.
 */

import { Option } from 'effect';
import all from 'virtual:hymnal';

import type { HymnText } from './text';

export type { HymnText, Section } from './text';

/** Every hymn, in number order. */
export const hymns: ReadonlyArray<HymnText> = all;

const byNumber = new Map(hymns.map((hymn) => [hymn.number, hymn]));

/** The hymn a route names (`100`, written without leading zeros), when the hymnal has it. */
export const hymnAt = (number: string): Option.Option<HymnText> =>
  Option.liftPredicate(number, (text) => /^[1-9]\d*$/.test(text)).pipe(
    Option.flatMap((text) => Option.fromNullishOr(byNumber.get(Number(text)))),
  );
