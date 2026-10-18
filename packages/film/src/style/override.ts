// The way out of a rule that has one (`rules.ts`, its way `override`): an
// override names the rule it frees and the place it frees it at, says why in
// a line, and cites the owner's own word that allows it: his words,
// verbatim (`quote`, owner, 2026-10-17), or his pick on a lab ask (`answer`:
// the ask, the question and the value of the option he chose), never both.
// A rule whose way is `none` (a grey shade, a hand that is not a circle) has
// no override, so `overrideOf` takes none. Each rule adds the fields it
// needs: FigureLock the print it frees (`lock.ts`). Whatever holds the rule
// skips only what an override names, at the place it names, and lists it as
// overridden. The word is his only when he gave it: an override's quote is,
// verbatim, a decision's or a note's on his production's ledger, and its
// answer a pick the ledger filed with the decision that answered that ask;
// else the override itself is broken, whatever rule it frees (`unbacked`;
// a film's build and its test read the ledger, `build.ts` `unsaid`). A
// question an agent asked him is never his word. Every override a figure
// carries is found by the fields every override has, wherever it is laid
// (`overridesIn`), so none is left out. Pure.

import { Predicate, Schema } from 'effect';
import type { OwnerWords } from '../core/production.ts';
import type { RULES, RuleId } from './rules.ts';

/** The rules an override may free: each whose way is `override`. */
type Freeable = {
  readonly [R in RuleId]: (typeof RULES)[R]['way'] extends 'override' ? R : never;
}[RuleId];

/** Words written out: not empty, and no space round them. */
export const Words = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty());

/** What every override carries, whatever its rule and its citation: the place it frees it at, and why. */
const CARRIED = { place: Words, reason: Words };

/**
 * The owner's pick an override may cite in place of his words: the lab ask
 * he answered (its id), the question (its name) and the value of the option
 * he chose there, each as the ledger files it.
 */
const Answer = Schema.Struct({ ask: Words, question: Words, value: Words });

/**
 * An override of `rule`: the place it frees it at, why in a line, the fields
 * its rule adds (`own`), and the owner's word that allows it: his words,
 * verbatim (`quote`), or his pick on an ask (`answer`), one, never both.
 */
export const overrideOf = <R extends Freeable, const F extends Schema.Struct.Fields>(
  rule: R,
  own: F,
) =>
  Schema.Union([
    Schema.Struct({ rule: Schema.Literal(rule), ...CARRIED, quote: Words, ...own }),
    Schema.Struct({ rule: Schema.Literal(rule), ...CARRIED, answer: Answer, ...own }),
  ]);

/** Any rule's override, as whatever holds it to the owner's word reads it: its rule, what every override carries, and its citation. */
const AnyOverride = Schema.Union([
  Schema.Struct({ rule: Schema.String, ...CARRIED, quote: Words }),
  Schema.Struct({ rule: Schema.String, ...CARRIED, answer: Answer }),
]);
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

/** What `override` cites as the owner's, in words: his words, quoted, or his pick on an ask. */
export const citedBy = (override: Override): string =>
  'quote' in override
    ? `"${override.quote}"`
    : `his pick "${override.answer.value}" for ${override.answer.question} on ask ${override.answer.ask}`;

/** An override laid on a film's figure: the item the figure is laid as, and the override. */
export interface Laid {
  readonly item: string;
  readonly override: Override;
}

/**
 * Whether the owner's word on his ledger (`words`) allows `override`: its
 * quote is one he said, verbatim, or its answer is a pick he made on that
 * ask, at that question.
 */
const backed = (override: Override, words: OwnerWords): boolean =>
  'quote' in override
    ? words.quotes.has(override.quote)
    : words.picks.get(override.answer.ask)?.[override.answer.question] === override.answer.value;

/** Why `item`'s `override` is broken: its citation is not on his ledger. */
const unbackedWhy = (item: string, override: Override): string => {
  const broken = `${item}'s override of ${override.rule} at ${override.place} is broken`;
  if ('quote' in override)
    return `${broken}: its quote is not on the ledger: no decision or note filed on his production says "${override.quote}"`;
  const { ask, question, value } = override.answer;
  return `${broken}: its answer is not on the ledger: no decision filed on his production by ask ${ask} picks "${value}" for ${question}`;
};

/**
 * Of the overrides laid on a film's figures, each the owner's word on his
 * production's ledger (`words`) does not allow: its quote is not, verbatim,
 * a decision's or a note's, or its answer is not a pick the ledger filed
 * with the decision that answered its ask. Such an override is broken
 * itself, whatever rule it frees, and frees nothing.
 */
export const unbacked = (laid: ReadonlyArray<Laid>, words: OwnerWords) =>
  laid
    .filter(({ override }) => !backed(override, words))
    .map(({ item, override }) => ({ item, override, why: unbackedWhy(item, override) }));
