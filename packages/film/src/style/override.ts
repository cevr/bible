// The way out of a rule that has one (`rules.ts`, its way `override`): an
// override names the rule it frees and the place it frees it at, says why in
// a line, and carries the owner's own words that allow it, verbatim (owner,
// 2026-10-17). A rule whose way is `none` (a grey shade, a hand that is not
// a circle) has no override, so `overrideOf` takes none. Each rule adds the
// fields it needs: FigureLock the print it frees (`lock.ts`). Whatever holds
// the rule skips only what an override names, at the place it names, and
// lists it as overridden. Pure.

import { Schema } from 'effect';
import type { RULES, RuleId } from './rules.ts';

/** The rules an override may free: each whose way is `override`. */
type Freeable = {
  readonly [R in RuleId]: (typeof RULES)[R]['way'] extends 'override' ? R : never;
}[RuleId];

/** Words written out: not empty, and no space round them. */
export const Words = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty());

/**
 * An override of `rule`: the place it frees it at, why in a line, the
 * owner's words that allow it, verbatim, and the fields its rule adds
 * (`own`).
 */
export const overrideOf = <R extends Freeable, const F extends Schema.Struct.Fields>(
  rule: R,
  own: F,
) =>
  Schema.Struct({
    rule: Schema.Literal(rule),
    place: Words,
    reason: Words,
    quote: Words,
    ...own,
  });
