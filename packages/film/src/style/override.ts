// The way out of a rule that has one (`rules.ts`, its way `override`): an
// override names the rule it frees and the place it frees it at, says why in
// a line, and cites the owner's own word that allows it: his words,
// verbatim (`quote`, owner, 2026-10-17), or his pick on a lab ask (`answer`:
// the ask, the question and the value of the option he chose), never both.
// A rule whose way is not `override` has none, so `overrideOf` takes none.
// Each rule adds the fields it needs: FigureLock the print it frees
// (`lock.ts`). Whatever holds the rule skips only what an override names, at
// the place it names, and lists it as overridden. The word is his only when
// he gave it on that figure: a decision of his on its production's ledger,
// filed at the point `item:<item>` (the figure's place in its film's file,
// where his lock on it is filed too), and after the lock when the override
// frees one; its quote is the decision's words, verbatim, or its answer the
// pick the decision filed with the ask it answered. Else the override itself
// is broken, whatever rule it frees (`unbacked`; a film's build and its test
// read the ledger, `build.ts` `unsaid` and `unlocked`). A question an agent
// asked him is never his word, a note decides nothing, and a decision on
// another figure, or on none, allows nothing here. Every override a figure
// carries is found by the fields every override has, wherever it is laid
// (`overridesIn`), so none is left out. Pure.

import { DateTime, Option, Predicate, Schema } from 'effect';
import type { Decided } from '../core/production.ts';
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

/**
 * An override laid on a film's figure: the item the figure is laid as, the
 * override, and for a lock's, the time the ledger filed the lock (`since`):
 * the decision that frees it is a later one.
 */
export interface Laid {
  readonly item: string;
  readonly override: Override;
  readonly since?: number;
}

/** The point a decision on the figure laid as `item` is filed at on its production's ledger, as the lock on it is. */
const pointOn = (item: string) => `item:${item}`;

/** Whether `decision` is the word `override` cites: its words, verbatim, or the pick it filed on the ask the override names. */
const cites = (override: Override, decision: Decided): boolean =>
  'quote' in override
    ? Option.contains(decision.quote, override.quote)
    : Option.contains(decision.ask, override.answer.ask) &&
      Option.exists(
        decision.picks,
        (picks) => picks[override.answer.question] === override.answer.value,
      );

/** Whether `decision` allows `laid`'s override: one on its figure, after its lock when it frees one, that it cites. */
const allows = ({ item, override, since }: Laid, decision: Decided): boolean =>
  Option.contains(decision.point, pointOn(item)) &&
  (since === undefined || decision.at > since) &&
  cites(override, decision);

/**
 * Why the owner's decisions on his production's ledger (`decisions`) do not
 * allow `laid`'s override, and how to file and cite one that does; none when
 * one does (`allows`).
 */
export const whyUnbacked = (
  laid: Laid,
  decisions: ReadonlyArray<Decided>,
): Option.Option<string> => {
  if (decisions.some((decision) => allows(laid, decision))) return Option.none();
  const { item, override, since } = laid;
  const point = pointOn(item);
  const where = `at the point ${point}${since === undefined ? '' : `, filed after his lock (${DateTime.formatIso(DateTime.makeUnsafe(since))})`}`;
  const broken = `${item}'s override of ${override.rule} at ${override.place} is broken`;
  if ('quote' in override)
    return Option.some(
      `${broken}: no decision on his production's ledger ${where} says "${override.quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point ${point}\`), then quote them verbatim`,
    );
  const { ask, question, value } = override.answer;
  return Option.some(
    `${broken}: no decision on his production's ledger ${where} answers ask ${ask} with "${value}" for ${question}: ask him with the point ${point} (the lab's \`ask\`, with its \`production\`, \`set\` and \`point\`), then cite the pick his answer files`,
  );
};

/**
 * Of the overrides laid on a film's figures, each the owner's decisions on
 * his production's ledger (`decisions`) do not allow (`whyUnbacked`), and
 * why. Such an override is broken itself, whatever rule it frees, and frees
 * nothing.
 */
export const unbacked = (laid: ReadonlyArray<Laid>, decisions: ReadonlyArray<Decided>) =>
  laid.flatMap((l) =>
    Option.toArray(Option.map(whyUnbacked(l, decisions), (why) => ({ ...l, why }))),
  );
