// The way out of a rule that has one (`rules.ts`, its way `override`): an
// override names the rule it frees and the place it frees it at, says why in
// a line, and carries the owner's own words that allow it, verbatim (owner,
// 2026-10-17). A rule whose way is `none` (a grey shade, a hand that is not
// a circle) has no override, so `overrideOf` takes none. Each rule adds the
// fields it needs: FigureLock the print it frees (`lock.ts`). Whatever holds
// the rule skips only what an override names, at the place it names, and
// lists it as overridden. The words are his only when he said them: an
// override's quote is, verbatim, a decision's or a note's on his
// production's ledger, or the override itself is broken, whatever rule it
// frees (`unquoted`; a film's build and its test read the ledger, `build.ts`
// `unsaid`). Every override a figure carries is found by the fields every
// override has, wherever it is laid (`overridesIn`), so none is left out.
// Pure.

import { Predicate, Schema } from 'effect';
import type { RULES, RuleId } from './rules.ts';

/** The rules an override may free: each whose way is `override`. */
type Freeable = {
  readonly [R in RuleId]: (typeof RULES)[R]['way'] extends 'override' ? R : never;
}[RuleId];

/** Words written out: not empty, and no space round them. */
export const Words = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty());

/** What every override carries, whatever its rule: the place it frees it at, why, and the owner's words. */
const CARRIED = { place: Words, reason: Words, quote: Words };

/**
 * An override of `rule`: the place it frees it at, why in a line, the
 * owner's words that allow it, verbatim, and the fields its rule adds
 * (`own`).
 */
export const overrideOf = <R extends Freeable, const F extends Schema.Struct.Fields>(
  rule: R,
  own: F,
) => Schema.Struct({ rule: Schema.Literal(rule), ...CARRIED, ...own });

/** Any rule's override, as whatever holds it to the owner's words reads it: its rule, and what every override carries. */
const AnyOverride = Schema.Struct({ rule: Schema.String, ...CARRIED });
type Override = typeof AnyOverride.Type;
const isOverride = Schema.is(AnyOverride);

/**
 * Every override `laid` carries (a figure, its parts and theirs, at any
 * depth), in the order its fields lay them, found by what every override
 * carries: an override laid in a new place is found as every other is.
 */
export const overridesIn = <T>(laid: T): ReadonlyArray<Override> => {
  if (isOverride(laid)) return [laid];
  if (Predicate.isObjectOrArray(laid)) return Object.values(laid).flatMap(overridesIn);
  return [];
};

/** An override laid on a film's figure: the item the figure is laid as, and the override. */
export interface Laid {
  readonly item: string;
  readonly override: Override;
}

/**
 * Of the overrides laid on a film's figures, each that does not carry the
 * owner's words: its quote is not, verbatim, one he said on his
 * production's ledger (`said`, each decision's and note's quote). Such an
 * override is broken itself, whatever rule it frees, and frees nothing.
 */
export const unquoted = (laid: ReadonlyArray<Laid>, said: ReadonlySet<string>) =>
  laid
    .filter(({ override }) => !said.has(override.quote))
    .map(({ item, override }) => ({
      item,
      override,
      why: `${item}'s override of ${override.rule} at ${override.place} is broken: its quote is not on the ledger: no decision or note filed on his production says "${override.quote}"`,
    }));
