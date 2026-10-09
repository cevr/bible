// `film/history-through-host`: a page never chooses a history move. Each
// field of a place declares its own policy (`Place.history`, @bible/url-state),
// and the address bar is written in one module, `browser/host.ts`
// (`addressOn`, `reloadAtAddress`), which reads that policy: a call site that
// picks push or replace itself is how a drag came to push an entry per step
// and a dismissal to go Back over another page's entry.
//
// Refused: a call of `.navigate(…)` (UrlState's, with its `history`), and a
// move read from `Location`: `push`, `replace`, `back`, `forward` or `go`,
// called or not, or taken by destructuring (`const { replace } = yield*
// Location`). A value is `Location` when it is bound to `yield* Location`
// (or `(yield* Location)` itself, or `<ns>.Location`), is the parameter of a
// callback handed to `Location.use`, to `Effect.flatMap(Location.asEffect(),
// …)` or to a `pipe` on `Location`, or is an alias of one. `Location` is the
// name `@bible/url-state`'s `Location` is imported under, or `<ns>.Location`.
// The config turns the rule off in `browser/host.ts`, the tests and the
// fixtures.

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

/** The moves of the address bar a page never chooses. */
const MOVES: ReadonlyArray<string> = ['push', 'replace', 'back', 'forward', 'go'];

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
const isLocation = (node: ESTree.Node): boolean => {
  if (node.type === 'Identifier') return locationNames(programOf(node)).includes(node.name);
  if (node.type === 'MemberExpression') return Option.contains(memberName(node), 'Location');
  return false;
};

/** `Location`, or `Location.asEffect()`: the effect that gives the service. */
const locationEffect = (node: ESTree.Node): boolean =>
  isLocation(node) ||
  (node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    Option.contains(memberName(node.callee), 'asEffect') &&
    isLocation(node.callee.object));

/** `yield* Location`. */
const yieldsLocation = (node: ESTree.Node): boolean =>
  node.type === 'YieldExpression' &&
  node.delegate &&
  Option.exists(Option.fromNullOr(node.argument), locationEffect);

/**
 * Whether a function is handed the service: the callback of `Location.use(…)`,
 * of a call that also takes `Location.asEffect()` (`Effect.flatMap(
 * Location.asEffect(), fn)`), or of a call piped on it (`Location.asEffect()
 * .pipe(Effect.flatMap(fn))`).
 */
const givenLocation = (fn: ESTree.Node): boolean => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.some((a) => a === fn)) return false;
  const callee = call.callee;
  if (
    callee.type === 'MemberExpression' &&
    Option.exists(memberName(callee), (m) => m === 'use' || m === 'useSync') &&
    isLocation(callee.object)
  )
    return true;
  if (call.arguments.some((a) => a !== fn && locationEffect(a))) return true;
  const piped = call.parent;
  return (
    piped?.type === 'CallExpression' &&
    piped.arguments.some((a) => a === call) &&
    piped.callee.type === 'MemberExpression' &&
    Option.contains(memberName(piped.callee), 'pipe') &&
    locationEffect(piped.callee.object)
  );
};

/** An answer read from the scope tree. */
type Reads = Effect.Effect<boolean, never, Effect.Services<ReturnType<typeof SourceCode.getScope>>>;

/** Whether `param` is a parameter of the function `fn`. */
const isParameter = (fn: ESTree.Node, param: ESTree.Node) =>
  (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
  fn.params.some((p) => p === param);

/** Whether `receiver` is the Location service, where it is read. */
const onLocation = (receiver: ESTree.Node): Reads => {
  if (receiver.type === 'ParenthesizedExpression') return onLocation(receiver.expression);
  if (yieldsLocation(receiver)) return Effect.succeed(true);
  if (receiver.type !== 'Identifier') return Effect.succeed(false);
  return Effect.flatMap(SourceCode.getScope(receiver), (scope) => {
    const def = Option.flatMap(Scope.findVariableUp(scope, receiver.name), (v: Variable) =>
      Option.fromUndefinedOr(v.defs[0]),
    );
    if (Option.isNone(def)) return Effect.succeed(false);
    const { type, node, name } = def.value;
    if (type === 'Parameter') return Effect.succeed(givenLocation(node) && isParameter(node, name));
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !node.init)
      return Effect.succeed(false);
    return onLocation(node.init);
  });
};

/** Whether an object pattern takes the service apart: `const { replace } = yield* Location`. */
const destructuresLocation = (pattern: ESTree.ObjectPattern) => {
  const owner = pattern.parent;
  if (owner.type === 'VariableDeclarator' && owner.id === pattern && owner.init)
    return onLocation(owner.init);
  return Effect.succeed(isParameter(owner, pattern) && givenLocation(owner));
};

/** Whether `node` is `x.navigate(…)`: UrlState's move, with its own `history`. */
const navigates = (call: ESTree.CallExpression) =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'navigate');

/** Whether `member` reads a move off the Location service. */
const movedOn = (member: ESTree.MemberExpression) => {
  if (!Option.exists(memberName(member), (m) => MOVES.includes(m))) return Effect.succeed(false);
  return onLocation(member.object);
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
    const report = (node: ESTree.Node, chooses: Reads) =>
      Effect.flatMap(chooses, (yes) =>
        Effect.asVoid(
          Effect.when(
            context.report(Diagnostic.make({ node, message: MESSAGE })),
            Effect.succeed(yes),
          ),
        ),
      );
    return Visitor.merge(
      Visitor.on('CallExpression', (call) => report(call, Effect.succeed(navigates(call)))),
      Visitor.merge(
        Visitor.on('MemberExpression', (member) => report(member, movedOn(member))),
        Visitor.on('ObjectPattern', (pattern) =>
          Effect.forEach(
            pattern.properties.filter(
              (p) =>
                p.type === 'Property' &&
                !p.computed &&
                p.key.type === 'Identifier' &&
                MOVES.includes(p.key.name),
            ),
            (p) => report(p, destructuresLocation(pattern)),
            { discard: true },
          ),
        ),
      ),
    );
  },
});
