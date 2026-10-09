// `film/history-through-host`: a page never chooses a history move. Each
// field of a place declares its own policy (`Place.history`, @bible/url-state),
// and the address bar is written in one module, `browser/host.ts`
// (`addressOn`, `reloadAtAddress`), which reads that policy: a call site that
// picks push or replace itself is how a drag came to push an entry per step
// and a dismissal to go Back over another page's entry.
//
// Refused: a call of `.navigate(…)` (UrlState's, with its `history`), and
// `push` or `replace` called on `Location`: on a name a `Location.use`
// callback is given, on a name bound to `yield* Location`, or on
// `(yield* Location)` itself. `Location` is the name `@bible/url-state`'s
// `Location` is imported under. The config turns the rule off in
// `browser/host.ts`, the tests and the fixtures.

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
import { memberName, programOf } from './nodes.ts';

const URL_STATE = '@bible/url-state';

const MESSAGE =
  "a history move chosen here: a place's field declares its policy (Place.history, @bible/url-state), and the address bar is written through addressOn (packages/film/src/browser/host.ts).";

/** The names a file imports `@bible/url-state`'s `Location` under. */
const locationNames = (program: ESTree.Node): ReadonlyArray<string> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== URL_STATE) return [];
    return statement.specifiers.flatMap((s) => {
      if (s.type !== 'ImportSpecifier' || s.imported.type !== 'Identifier') return [];
      if (s.imported.name !== 'Location') return [];
      return [s.local.name];
    });
  });
};

/** Whether `node` names the `Location` service: an imported name, or `<ns>.Location`. */
const isLocation = (node: ESTree.Node, names: ReadonlyArray<string>): boolean => {
  if (node.type === 'Identifier') return names.includes(node.name);
  if (node.type === 'MemberExpression') return Option.contains(memberName(node), 'Location');
  return false;
};

/** `yield* Location`. */
const yieldsLocation = (node: ESTree.Node, names: ReadonlyArray<string>): boolean =>
  node.type === 'YieldExpression' &&
  node.delegate &&
  Option.exists(Option.fromNullOr(node.argument), (a) => isLocation(a, names));

/** Whether a function is the callback of `Location.use(…)`. */
const usedOnLocation = (fn: ESTree.Node, names: ReadonlyArray<string>): boolean => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || call.arguments[0] !== fn) return false;
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    Option.exists(memberName(callee), (m) => m === 'use' || m === 'useSync') &&
    isLocation(callee.object, names)
  );
};

/** Whether `receiver` is the Location service, where it is read. */
const onLocation = (receiver: ESTree.Node, names: ReadonlyArray<string>) => {
  if (yieldsLocation(receiver, names)) return Effect.succeed(true);
  if (receiver.type !== 'Identifier') return Effect.succeed(false);
  return Effect.map(SourceCode.getScope(receiver), (scope) =>
    Option.exists(
      Option.flatMap(Scope.findVariableUp(scope, receiver.name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
      (def) => {
        if (def.type === 'Parameter') return usedOnLocation(def.node, names);
        const declarator = def.node;
        return (
          declarator.type === 'VariableDeclarator' &&
          Option.exists(Option.fromNullOr(declarator.init), (init) => yieldsLocation(init, names))
        );
      },
    ),
  );
};

/** Whether a call chooses a history move: `.navigate(…)`, or `push`/`replace` on `Location`. */
const choosesMove = (call: ESTree.CallExpression) => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return Effect.succeed(false);
  const method = memberName(callee);
  if (Option.contains(method, 'navigate')) return Effect.succeed(true);
  if (!Option.exists(method, (m) => m === 'push' || m === 'replace')) return Effect.succeed(false);
  const names = locationNames(programOf(call));
  if (names.length === 0) return Effect.succeed(false);
  const receiver = callee.object;
  if (receiver.type === 'ParenthesizedExpression') return onLocation(receiver.expression, names);
  return onLocation(receiver, names);
};

export const historyThroughHost = Rule.define({
  name: 'history-through-host',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page never chooses a history move: a place's field declares its policy, and the address bar is written in browser/host.ts alone.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (call) =>
      Effect.flatMap(choosesMove(call), (chooses) =>
        Effect.asVoid(
          Effect.when(
            context.report(Diagnostic.make({ node: call, message: MESSAGE })),
            Effect.succeed(chooses),
          ),
        ),
      ),
    );
  },
});
