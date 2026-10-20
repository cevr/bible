/**
 * The hymns a run renders, from its flags: `--hymns 1,46,663` (unpadded
 * numbers) or `--all`, never both and never neither.
 */

import { Array as Arr, Effect, Option } from 'effect';
import { RenderFailed } from './proc.js';

export const FIRST = 1;
export const LAST = 695;

const refused = (reason: string) => RenderFailed.make({ step: 'arguments', reason });

/** `1,46,663` as hymn numbers, once each; a part that is not a hymn from 1 to 695 fails. */
export const hymnsOf = (text: string) => {
  const numbers = text.split(',').map((part) => part.trim());
  const bad = numbers.filter((n) => !/^\d+$/.test(n) || Number(n) < FIRST || Number(n) > LAST);
  return bad.length > 0
    ? Effect.fail(refused(`not a hymn from ${FIRST} to ${LAST}: ${bad.join(', ')}`))
    : Effect.succeed(Arr.dedupe(numbers.map(Number)));
};

/** The hymns the flags name. */
export const chosenOf = (hymns: Option.Option<string>, all: boolean) =>
  Option.match(hymns, {
    onNone: () =>
      all ? Effect.succeed(Arr.range(FIRST, LAST)) : Effect.fail(refused('name --hymns or --all')),
    onSome: (text) =>
      all ? Effect.fail(refused('name --hymns or --all, not both')) : hymnsOf(text),
  });
