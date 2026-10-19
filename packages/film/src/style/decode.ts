// How the house checks what a film composes as it is made: each part, paper
// and figure decoded by its schema with no field the schema lacks
// (`onExcessProperty: 'error'`), so a spread object's stray field is refused
// as a fresh literal's is. A schema that holds a rule says so (`holding`: a
// check, or a slot's union of forms), so a refusal names what it refused,
// the rule it breaks when one names it (`rules.ts`) with its way out, and the
// decode's words with their place; it is thrown, so a module that composes a
// figure breaking a rule does not load. Pure.

import { Data, Match, Predicate, Result, Schema, type SchemaIssue } from 'effect';
import { RULES, type RuleId, type Way } from './rules.ts';

/** What a refusal says of a rule's way out. */
const WAY_OUT: Readonly<Record<Way, string>> = {
  none: 'nothing frees it',
  owner: 'no part carries an override of it: only the owner may change it, so ask him first',
  override: "only an override citing the owner's decision on the figure frees it",
};

/** What the house refused as it was made: a part, a paper or a figure; the rule it breaks, when one names it; and why. */
class StyleRefused extends Data.TaggedError('StyleRefused')<{
  readonly part: string;
  readonly rule: RuleId | undefined;
  readonly why: string;
}> {
  override get message() {
    if (this.rule === undefined) return `${this.part} refused: ${this.why}`;
    const rule = RULES[this.rule];
    return `${this.part} refused by ${this.rule}, ${rule.says} (${rule.source}; ${WAY_OUT[rule.way]}): ${this.why}`;
  }
}

/**
 * What a schema that holds `rule` is annotated with (a check, or a slot's
 * union of forms): a refusal it makes names the rule.
 */
export const holding = (rule: RuleId) => ({ rule });

/** Whether `u` is a rule's id. */
const isRuleId = (u: unknown): u is RuleId => Predicate.isString(u) && Object.hasOwn(RULES, u);

/** The rule a schema's `annotations` say it holds (`holding`), if any. */
const heldIn = (annotations: Schema.Annotations.Annotations | undefined): RuleId | undefined => {
  const rule = annotations?.['rule'];
  return isRuleId(rule) ? rule : undefined;
};

/** A check holding `rule`: `holds` answers true, or what breaks the rule. */
export const ruleCheck = <T>(rule: RuleId, holds: (input: T) => true | string) =>
  Schema.makeFilter(holds, holding(rule));

/**
 * The rule a kind breaks with a field it lacks: `any`, whatever the field (a
 * hand is its paper and its share, nothing else); else the one its `fields`
 * name for that field (ink or a rim on a part laid within another).
 */
interface Refuses {
  readonly any?: RuleId;
  readonly fields?: Readonly<Record<string, RuleId>>;
}

/**
 * A decode of `schema`: a value of it, made of `input` for `part` (what a
 * refusal names), or a `StyleRefused` thrown naming the rule it breaks: the
 * first a schema on the issue's way holds (a check; a union's form before
 * the union itself, which a value of none of its forms breaks), else the one
 * `refuses` names for the stray field it found.
 */
export const decoder = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  refuses: Refuses = {},
) => {
  const decode = Schema.decodeUnknownResult(schema, { onExcessProperty: 'error' });
  const byField = new Map<PropertyKey | undefined, RuleId>(Object.entries(refuses.fields ?? {}));
  /** The first rule any of `issues` breaks, in their order. */
  const firstIn = (issues: ReadonlyArray<SchemaIssue.Issue>, at: PropertyKey | undefined) =>
    issues.reduce<RuleId | undefined>((found, issue) => found ?? ruleOf(issue, at), undefined);
  /** The rule `issue` breaks, `at` the last key on its way. */
  const ruleOf = (issue: SchemaIssue.Issue, at: PropertyKey | undefined): RuleId | undefined =>
    Match.valueTags(issue, {
      Filter: (i) => heldIn(i.filter.annotations) ?? ruleOf(i.issue, at),
      Pointer: (i) => ruleOf(i.issue, i.path.at(-1) ?? at),
      Encoding: (i) => ruleOf(i.issue, at),
      Composite: (i) => firstIn(i.issues, at),
      AnyOf: (i) => firstIn(i.issues, at) ?? heldIn(i.ast.annotations),
      UnexpectedKey: () => byField.get(at) ?? refuses.any,
      MissingKey: () => undefined,
      InvalidType: () => undefined,
      InvalidValue: () => undefined,
      Forbidden: () => undefined,
      OneOf: () => undefined,
    });
  return (input: S['Encoded'], part: string): S['Type'] =>
    Result.getOrThrowWith(
      decode(input),
      ({ issue, message }) =>
        new StyleRefused({ part, rule: ruleOf(issue, undefined), why: message }),
    );
};
