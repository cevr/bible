// `film/booleans-through-pressed`: a boolean a control shows is written by
// `pressed(on)` (`packages/film/src/lab/pressed.ts`), which types it
// `'true' | 'false'`, never as a string by hand. A template or `String(…)` over
// a boolean is a second spelling of it, and the one that was fixed by hand twice
// (Scenes, then the sheet and the page shell) came back at six more controls.
//
// Refused, as a JSX attribute's value:
// - on `aria-pressed`, `aria-selected`, `aria-checked`, `aria-expanded`,
//   `aria-busy` and `aria-current`: a template with a value in it
//   (`` `${on()}` ``), or a `String(…)` call;
// - on any `data-*`: `String(x)` or a template of one value, where `x` is a
//   comparison (`a === b`), a negation (`!a`), a logical `&&`/`||` of such, or
//   a call named as a boolean is (`isLive()`, `hasCue()`, `canUndo()`,
//   `staged()`). A number (`String(rate())`) and a text pass.
// The config turns it on over the lab's components and off in the tests and
// the fixtures.

import { Effect, Option } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const MESSAGE =
  "a boolean written as a string by hand: pressed(on) (packages/film/src/lab/pressed.ts) types it 'true' | 'false'.";

/** The ARIA states a control shows as a boolean. */
const ARIA_STATES: ReadonlyArray<string> = [
  'aria-pressed',
  'aria-selected',
  'aria-checked',
  'aria-expanded',
  'aria-busy',
  'aria-current',
];

/** A name read as a boolean: `isLive`, `hasCue`, `canUndo`, `shouldRun`, or a participle (`staged`, `selected`). */
const BOOLEAN_NAME = /^(?:(?:is|has|can|should|was|does|will)[A-Z]\w*|\w+ed)$/u;

/** Whether `node` is a call of `String(…)`, with its argument. */
const stringOf = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  if (node.type !== 'CallExpression') return Option.none();
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'String') return Option.none();
  return Option.fromUndefinedOr(node.arguments[0]);
};

/** A template with a value in it, and the one value it writes when it writes only that. */
const interpolated = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  if (node.type !== 'TemplateLiteral') return Option.none();
  return Option.fromUndefinedOr(node.expressions[0]);
};

/** The name a call reads: `staged()`, `props.staged()`. */
const calledName = (call: ESTree.CallExpression): Option.Option<string> => {
  if (call.callee.type === 'Identifier') return Option.some(call.callee.name);
  if (call.callee.type === 'MemberExpression') return memberName(call.callee);
  return Option.none();
};

/** Whether `node` is evidently a boolean: a comparison, a negation, a logical of such, or a call named as one. */
const isBoolean = (node: ESTree.Node): boolean => {
  if (node.type === 'ParenthesizedExpression') return isBoolean(node.expression);
  if (node.type === 'UnaryExpression') return node.operator === '!';
  if (node.type === 'BinaryExpression')
    return ['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(
      node.operator,
    );
  if (node.type === 'LogicalExpression')
    return node.operator !== '??' && (isBoolean(node.left) || isBoolean(node.right));
  if (node.type === 'CallExpression')
    return Option.exists(calledName(node), (name) => BOOLEAN_NAME.test(name));
  return false;
};

/** The expression a JSX attribute's value holds. */
const expressionOf = (attr: ESTree.JSXAttribute): Option.Option<ESTree.Node> => {
  if (attr.value?.type !== 'JSXExpressionContainer') return Option.none();
  return Option.some(attr.value.expression);
};

/** Whether a JSX attribute writes a boolean as a string by hand. */
const writesBoolean = (attr: ESTree.JSXAttribute): boolean => {
  if (attr.name.type !== 'JSXIdentifier') return false;
  const name = attr.name.name;
  const value = expressionOf(attr);
  if (ARIA_STATES.includes(name))
    return Option.exists(
      value,
      (v) => Option.isSome(stringOf(v)) || Option.isSome(interpolated(v)),
    );
  if (!name.startsWith('data-')) return false;
  return Option.exists(value, (v) =>
    Option.exists(
      Option.orElse(stringOf(v), () => interpolated(v)),
      isBoolean,
    ),
  );
};

export const booleansThroughPressed = Rule.define({
  name: 'booleans-through-pressed',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A boolean a control shows is written by pressed(on), never a template or String(…) by hand.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      JSXAttribute: (attr: ESTree.JSXAttribute) =>
        Option.match(Option.liftPredicate(attr, writesBoolean), {
          onNone: () => Effect.void,
          onSome: (a) => context.report(Diagnostic.make({ node: a, message: MESSAGE })),
        }),
    };
  },
});
