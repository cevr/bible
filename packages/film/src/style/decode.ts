// How the house checks what a film composes as it is made: each part, paper
// and figure decoded by its schema with no field the schema lacks
// (`onExcessProperty: 'error'`), so a spread object's stray field is refused
// as a fresh literal's is. A refusal names what it refused, the rule it breaks
// when one names it (`rules.ts`) and the decode's words with their place; it
// is thrown, so a module that composes a figure breaking a rule does not load.
// Pure.

import { Data, Result, Schema, type SchemaIssue } from 'effect';
import { RULES, type RuleId } from './rules.ts';

/** What the house refused as it was made: a part, a paper or a figure; the rule it breaks, when one names it; and why. */
class StyleRefused extends Data.TaggedError('StyleRefused')<{
  readonly part: string;
  readonly rule: RuleId | undefined;
  readonly why: string;
}> {
  override get message() {
    if (this.rule === undefined) return `${this.part} refused: ${this.why}`;
    const rule = RULES[this.rule];
    const way =
      rule.way === 'none' ? 'nothing frees it' : 'only an override with the owner’s words frees it';
    return `${this.part} refused by ${this.rule}, ${rule.says} (${rule.source}; ${way}): ${this.why}`;
  }
}

/** Each check that holds a rule, to its rule: a refusal it makes names the rule. */
const holding = new Map<object, RuleId>();

/** A check holding `rule`: `holds` answers true, or what breaks the rule. */
export const ruleCheck = <T>(rule: RuleId, holds: (input: T) => true | string) => {
  const check = Schema.makeFilter(holds);
  holding.set(check, rule);
  return check;
};

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
 * first check on the issue's way that holds one, else the one `refuses` names
 * for the stray field it found.
 */
export const decoder = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  refuses: Refuses = {},
) => {
  const decode = Schema.decodeUnknownResult(schema, { onExcessProperty: 'error' });
  const byField = new Map<PropertyKey | undefined, RuleId>(Object.entries(refuses.fields ?? {}));
  /** The rule `issue` breaks, `at` the last key on its way. */
  const ruleOf = (issue: SchemaIssue.Issue, at: PropertyKey | undefined): RuleId | undefined => {
    switch (issue._tag) {
      case 'Filter':
        return holding.get(issue.filter) ?? ruleOf(issue.issue, at);
      case 'Pointer':
        return ruleOf(issue.issue, issue.path.at(-1) ?? at);
      case 'Composite':
        return ruleOf(issue.issues[0], at);
      case 'Encoding':
        return ruleOf(issue.issue, at);
      case 'UnexpectedKey':
        return byField.get(at) ?? refuses.any;
      default:
        return undefined;
    }
  };
  return (input: S['Encoded'], part: string): S['Type'] =>
    Result.getOrThrowWith(
      decode(input),
      ({ issue, message }) =>
        new StyleRefused({ part, rule: ruleOf(issue, undefined), why: message }),
    );
};
