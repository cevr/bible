// `film/no-host-alias`: a page reaches the host under the host's own name, so
// the bans on its members (`performance.now`, `document.location`,
// `window.history`) and the rule on its events can read every use of it. A
// host global bound to a name of the page's own (`const perf = performance`,
// `const { now } = performance`, `later = window`) is a use no ban can follow:
// `perf.now()` passes every one.
//
// Refused: the host's global objects (`window`, `document`, `navigator`,
// `performance`, `location`, `history`, `globalThis`, `self`) as the value
// of a declaration or an assignment. A name the file declares itself (a
// parameter called `self`) is no host global. The config turns the rule on
// over the pages that reach the host through its adapters and off in the
// tests and the fixtures.

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

/** The host's global objects. */
const HOSTS: ReadonlyArray<string> = [
  'window',
  'document',
  'navigator',
  'performance',
  'location',
  'history',
  'globalThis',
  'self',
];

const MESSAGE =
  'a host global bound to a name of the page\'s own: the host bans read it only under its name, so reach it as itself, or through its adapter (packages/film/README.md, "The host").';

/** Whether `node` is a host global, where it is read: a host name the file declares nowhere. */
const isHostGlobal = (node: ESTree.Node) => {
  if (node.type === 'ParenthesizedExpression') return isHostGlobal(node.expression);
  if (node.type !== 'Identifier' || !HOSTS.includes(node.name)) return Effect.succeed(false);
  return Effect.map(SourceCode.getScope(node), (scope) =>
    Option.isNone(
      Option.flatMap(Scope.findVariableUp(scope, node.name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
    ),
  );
};

export const noHostAlias = Rule.define({
  name: 'no-host-alias',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A host global is never bound to a name of the page's own: the host bans read it only under its name.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, value: Option.Option<ESTree.Node>) =>
      Effect.flatMap(
        Option.match(value, {
          onNone: () => Effect.succeed(false),
          onSome: isHostGlobal,
        }),
        (aliased) =>
          Effect.asVoid(
            Effect.when(
              context.report(Diagnostic.make({ node, message: MESSAGE })),
              Effect.succeed(aliased),
            ),
          ),
      );
    return Visitor.merge(
      Visitor.on('VariableDeclarator', (node) => report(node, Option.fromNullOr(node.init))),
      Visitor.on('AssignmentExpression', (node) =>
        report(
          node,
          Option.liftPredicate(node.right, () => node.operator === '='),
        ),
      ),
    );
  },
});
