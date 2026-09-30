// `film/no-ease-on-cue`: a cue's progress is eased once, by its span's `ease`.
// `f.at(cue)` already returns the eased progress (the span's `ease`, which the
// lab's picker writes), so `ease.inCubic(f.at('plunge'))` curves it a second
// time: the picker no longer sets the curve the frame draws, and a push whose
// zoom takes the second ease runs on another clock than its x and y. A
// camera push is a `shotPath` stop with `pushInto`; a motion that needs
// another curve reads its own cue (`with` the first, its own `ease`) or
// `f.keys(cue, …)`, whose keys name their ease.
//
// The rule reads `ease.<name>(x)` where `x` is a call to `.at(…)` or a name
// bound (by `const`, anywhere in scope) to one. A progress passed in as a
// parameter is not traced.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Scope,
  SourceCode,
  type Variable,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

/** `f.at(…)`: a call to a member named `at`. */
const isCueProgress = (n: ESTree.Node): boolean =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  Option.contains(memberName(n.callee), 'at');

/** `ease.inCubic(x)`: the one argument of a call on `ease`, when it is one. */
const easedArgument = (n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const callee = n.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.object.type !== 'Identifier' ||
    callee.object.name !== 'ease' ||
    n.arguments.length !== 1
  )
    return Option.none();
  return Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement');
};

/** Whether `name`, where `node` sits, is a `const` bound to a cue's progress. */
const boundToCue = (node: ESTree.Node, name: string) =>
  Effect.map(SourceCode.getScope(node), (scope) =>
    Option.exists(
      Option.flatMap(Scope.findVariableUp(scope, name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
      (def) =>
        def.node.type === 'VariableDeclarator' &&
        Option.exists(Option.fromNullOr(def.node.init), isCueProgress),
    ),
  );

/** Whether `x` is a cue's progress: `f.at(…)`, or a const bound to it. */
const readsCue = (x: ESTree.Node) => {
  if (isCueProgress(x)) return Effect.succeed(true);
  if (x.type === 'Identifier') return boundToCue(x, x.name);
  return Effect.succeed(false);
};

export const noEaseOnCue = Rule.define({
  name: 'no-ease-on-cue',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A cue's progress is eased once, by its span's ease: ease.X(f.at(cue)) curves it again where the lab's picker cannot reach.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Option.match(easedArgument(node), {
        onNone: () => Effect.void,
        onSome: (x) =>
          Effect.asVoid(
            Effect.when(
              context.report(
                Diagnostic.make({
                  node,
                  message:
                    "a cue's progress eased a second time: f.at(cue) is already eased by the span's `ease`, which the lab sets. A camera push is a shotPath stop with pushInto; another curve is its own cue or f.keys.",
                }),
              ),
              readsCue(x),
            ),
          ),
      }),
    );
  },
});
