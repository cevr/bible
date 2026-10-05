// `film/keys-named-as-bound`: a control's title names its command's key as
// bound now, never a key written into it or read once. The viewer rebinds
// any key in the `?` sheet (`command/keymap.ts`, `rebind`): a title that
// wrote `(n)`, or read the keymap once as the control was made, still names
// the old key after a rebind. A Solid control reads `hubKeys`
// (`lab/command/changes.ts`: `titled`, `text`, `first`), which follows each
// change of keys; a control outside Solid names itself with `titledNow`
// (`command/hub.ts`) again on `Hub.subscribe`.
//
// Refused: a call of `.keysOf(…)` (the keymap read directly), and a `title`
// (a JSX attribute, or an assignment to `.title`) written with a key in
// brackets in its text: `(n)`, `(⌘Z)`, `(⇧L)`, `(Esc)`, `(←)`, `(Ctrl+K)`.
// The config turns it off where the keymap and its followers are made:
// `src/command/` and `lab/command/changes.ts`.

import { Effect, Option, Predicate } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const FOLLOW =
  "name the key as bound now: hubKeys' titled or text in Solid (packages/film/src/lab/command/changes.ts), titledNow on Hub.subscribe outside it (packages/film/src/command/hub.ts)";

/** A key in brackets, as a title writes one: a single key, a modifier's mark, a named key or a chord. */
const KEY_IN_BRACKETS =
  /\((?:[⌘⇧⌥⌃←→↑↓][^()]*|(?:Esc|Space|Enter|Tab|Home|End)|(?:Ctrl|Shift|Alt)\+[^()]*|[^\s()])\)/u;

/**
 * The text an expression writes when it is a string or a template: its
 * literal parts, a space where each value goes (a value is no key written).
 */
const written = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral')
    return Option.some(node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' '));
  if (node.type === 'JSXExpressionContainer') return written(node.expression);
  return Option.none();
};

/** Whether `node` writes a key in brackets into its text. */
const namesAKey = (node: ESTree.Node): boolean =>
  Option.exists(written(node), (text) => KEY_IN_BRACKETS.test(text));

/** A call that reads the keymap directly: `hub.keysOf(id)`. */
const readsKeymap = (call: ESTree.CallExpression): boolean =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'keysOf');

/** A JSX `title` written with a key in it. */
const titleAttr = (attr: ESTree.JSXAttribute): boolean =>
  attr.name.type === 'JSXIdentifier' &&
  attr.name.name === 'title' &&
  Option.exists(Option.fromNullishOr(attr.value), namesAKey);

/** An assignment of a title written with a key in it: `button.title = 'Next (→)'`. */
const titleSet = (assign: ESTree.AssignmentExpression): boolean =>
  assign.left.type === 'MemberExpression' &&
  Option.contains(memberName(assign.left), 'title') &&
  namesAKey(assign.right);

const READ_ONCE = 'keysOf reads the keymap once, so a rebound key reads as the old one';
const WRITTEN = 'a title written with its key';

export const keysNamedAsBound = Rule.define({
  name: 'keys-named-as-bound',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A control's title names its command's key as bound now, never written or read once.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const reportIf = <N extends ESTree.Node>(node: N, refused: (n: N) => boolean, what: string) =>
      Option.match(Option.liftPredicate(node, refused), {
        onNone: () => Effect.void,
        onSome: (n) => context.report(Diagnostic.make({ node: n, message: `${what}: ${FOLLOW}.` })),
      });
    return {
      CallExpression: (call: ESTree.CallExpression) => reportIf(call, readsKeymap, READ_ONCE),
      JSXAttribute: (attr: ESTree.JSXAttribute) => reportIf(attr, titleAttr, WRITTEN),
      AssignmentExpression: (assign: ESTree.AssignmentExpression) =>
        reportIf(assign, titleSet, WRITTEN),
    };
  },
});
