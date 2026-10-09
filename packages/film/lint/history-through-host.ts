// `film/history-through-host`: a page never chooses a history move. Each
// field of a place declares its own policy (`Place.history`, @bible/url-state),
// and the address bar is written in one module, `browser/host.ts`
// (`addressOn`, `reloadAtAddress`), which reads that policy and owns the one
// traversal a page makes, a dismissal's Back (`addressOn(host).dismiss`): a
// call site that picks push or replace itself is how a drag came to push an
// entry per step, and one that picks Back how a dismissal went Back over
// another page's entry.
//
// Refused:
// - a call of `.navigate(…)` (UrlState's, with its `history`);
// - a move read from `Location`: `push`, `replace`, `back`, `forward` or
//   `go`, called or not, or taken by destructuring under any static key
//   (`const { replace } = yield* Location`, `{ 'back': b }`, `{ ['go']: g }`);
// - a traversal (`back`, `forward`) read from the bar `addressOn` gives, the
//   same ways: the bar's dismissal chooses Back, never its caller.
// A value is `Location` when it is bound to `yield* Location` (or
// `(yield* Location)` itself), is `Context.get(…, Location)` or
// `Context.getUnsafe(…, Location)`, is the parameter of a callback handed to
// `Location.use`, to `Effect.flatMap(Location.asEffect(), …)` or to a `pipe`
// on `Location`, or is an alias of one. `Location` is the name
// `@bible/url-state`'s `Location` is imported under, or `<ns>.Location` where
// `<ns>` is a namespace import of `@bible/url-state`. A value is the bar when
// it is a call of the name `browser/host.ts`'s `addressOn` is imported under,
// or an alias of one. The config turns the rule off in `browser/host.ts`, the
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
import { keyName, memberName, programOf } from './nodes.ts';

const URL_STATE = '@bible/url-state';

/** The module that owns the address bar: `addressOn` is imported from a path ending here. */
const HOST_MODULE = /(?:^|\/)browser\/host\.ts$/u;

const MESSAGE =
  "a history move chosen here: a place's field declares its policy (Place.history, @bible/url-state), and the address bar is written through addressOn (packages/film/src/browser/host.ts).";

/** The moves of `Location` a page never chooses. */
const MOVES: ReadonlyArray<string> = ['push', 'replace', 'back', 'forward', 'go'];

/** The traversals the bar's dismissal chooses, never its caller. */
const TRAVERSALS: ReadonlyArray<string> = ['back', 'forward'];

/** The names a file imports `imported` from a module `from` accepts under. */
const importedNames = (
  program: ESTree.Node,
  from: (source: string) => boolean,
  imported: string,
): ReadonlyArray<string> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || !from(String(statement.source.value))) return [];
    return statement.specifiers.flatMap((s) => {
      if (s.type !== 'ImportSpecifier' || s.imported.type !== 'Identifier') return [];
      if (s.imported.name !== imported) return [];
      return [s.local.name];
    });
  });
};

/** The names a file imports `@bible/url-state` whole under (`import * as US`). */
const namespaceNames = (program: ESTree.Node): ReadonlyArray<string> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== URL_STATE) return [];
    return statement.specifiers
      .filter((s) => s.type === 'ImportNamespaceSpecifier')
      .map((s) => s.local.name);
  });
};

/** Whether `node` names the `Location` service: its imported name, or `<url-state ns>.Location`. */
const isLocation = (node: ESTree.Node): boolean => {
  const program = programOf(node);
  if (node.type === 'Identifier')
    return importedNames(program, (s) => s === URL_STATE, 'Location').includes(node.name);
  return (
    node.type === 'MemberExpression' &&
    Option.contains(memberName(node), 'Location') &&
    node.object.type === 'Identifier' &&
    namespaceNames(program).includes(node.object.name)
  );
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

/** `Context.get(context, Location)` or `Context.getUnsafe(context, Location)`: the service, out of a context. */
const takenFromContext = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'Context' &&
  Option.exists(memberName(node.callee), (m) => m === 'get' || m === 'getUnsafe') &&
  Option.exists(Option.fromUndefinedOr(node.arguments[1]), isLocation);

/** `addressOn(host)`, under the name `browser/host.ts`'s `addressOn` is imported as. */
const makesBar = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  importedNames(programOf(node), (s) => HOST_MODULE.test(s), 'addressOn').includes(
    node.callee.name,
  );

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

/** What a value is, of the two this rule watches: the `Location` service, or the bar `addressOn` gives. */
type Held = 'location' | 'bar';

/** An answer read from the scope tree. */
type Reads<A> = Effect.Effect<A, never, Effect.Services<ReturnType<typeof SourceCode.getScope>>>;

/** Whether `param` is a parameter of the function `fn`. */
const isParameter = (fn: ESTree.Node, param: ESTree.Node) =>
  (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
  fn.params.some((p) => p === param);

/** The moves a page never reads off what it holds. */
const REFUSED: Readonly<Record<Held, ReadonlyArray<string>>> = {
  location: MOVES,
  bar: TRAVERSALS,
};

/** What `receiver` holds, where it is read: the service, the bar, or neither. */
const heldBy = (receiver: ESTree.Node): Reads<Option.Option<Held>> => {
  if (receiver.type === 'ParenthesizedExpression') return heldBy(receiver.expression);
  if (yieldsLocation(receiver) || takenFromContext(receiver))
    return Effect.succeedSome<Held>('location');
  if (makesBar(receiver)) return Effect.succeedSome<Held>('bar');
  if (receiver.type !== 'Identifier') return Effect.succeedNone;
  return Effect.flatMap(SourceCode.getScope(receiver), (scope) => {
    const def = Option.flatMap(Scope.findVariableUp(scope, receiver.name), (v: Variable) =>
      Option.fromUndefinedOr(v.defs[0]),
    );
    if (Option.isNone(def)) return Effect.succeedNone;
    const { type, node, name } = def.value;
    if (type === 'Parameter')
      return Effect.succeed(
        Option.liftPredicate(
          'location' as const,
          () => givenLocation(node) && isParameter(node, name),
        ),
      );
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !node.init)
      return Effect.succeedNone;
    return heldBy(node.init);
  });
};

/** What an object pattern takes apart: `const { replace } = yield* Location`, `const { back } = addressOn(host)`. */
const destructured = (pattern: ESTree.ObjectPattern): Reads<Option.Option<Held>> => {
  const owner = pattern.parent;
  if (owner.type === 'VariableDeclarator' && owner.id === pattern && owner.init)
    return heldBy(owner.init);
  return Effect.succeed(
    Option.liftPredicate(
      'location' as const,
      () => isParameter(owner, pattern) && givenLocation(owner),
    ),
  );
};

/** Whether `node` is `x.navigate(…)`: UrlState's move, with its own `history`. */
const navigates = (call: ESTree.CallExpression) =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'navigate');

/** Whether `name` is a move refused on what `held` reads as. */
const refusedOn = (held: Reads<Option.Option<Held>>, name: string): Reads<boolean> =>
  Effect.map(held, (h) => Option.exists(h, (on) => REFUSED[on].includes(name)));

export const historyThroughHost = Rule.define({
  name: 'history-through-host',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page never chooses a history move: a place's field declares its policy, and the address bar is written in browser/host.ts alone.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, chooses: Reads<boolean>) =>
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
        Visitor.on('MemberExpression', (member) =>
          Option.match(
            Option.filter(memberName(member), (name) => MOVES.includes(name)),
            {
              onNone: () => Effect.void,
              onSome: (name) => report(member, refusedOn(heldBy(member.object), name)),
            },
          ),
        ),
        Visitor.on('ObjectPattern', (pattern) =>
          Effect.forEach(
            pattern.properties.flatMap((p) =>
              Option.toArray(
                Option.map(
                  Option.filter(keyName(p), (name) => MOVES.includes(name)),
                  (name) => [p, name] as const,
                ),
              ),
            ),
            ([p, name]) => report(p, refusedOn(destructured(pattern), name)),
            { discard: true },
          ),
        ),
      ),
    );
  },
});
