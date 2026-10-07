// How a count is said, one rule for the lab's pages and the CLI's lines: a
// noun is plural but for one (`1 scene`, `0 scenes`, `3 scenes`). Pure.

import { Boolean as Bool } from 'effect';

/** `noun` as `n` of them are named: plural but for one (`scene`, `scenes`). */
export const plural = (n: number, noun: string): string =>
  Bool.match(n === 1, { onTrue: () => noun, onFalse: () => `${noun}s` });

/** `n` and `noun`, plural but for one: `1 scene`, `3 scenes`. */
export const counted = (n: number, noun: string): string => `${n} ${plural(n, noun)}`;
