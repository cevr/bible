// `film/no-lazy-test-fixture`: a test file makes no fixture its cases share
// on first use. A memo made where the file loads (`Effect.cached` and its
// TTL forms, outside every function but a `describe` body) is built by
// the first case that asks for it, inside that case's time limit, and
// which case pays moves with the order the cases run in (the package
// entries' first case reads the whole source graph in its limit: 0.55 s
// alone and past 5 s on a busy machine, 0.01 s with the graph read as the
// file loads). Build the fixture as the file loads
// (`const x = await Effect.runPromise(…)`), where no case's limit holds its
// cost, or make it in each case that needs it.
//
// A memo is made by a memo maker given its effect (`cached(read)`,
// `cachedWithTTL(read, ttl)`), by a memo maker applied, directly or by a
// name that holds it (`cachedWithTTL(ttl)(read)`, `withinMinute(read)`), or
// by one a pipe applies (`read.pipe(Effect.cached)`). A TTL form given its
// ttl alone, or a `flow(…)` with a memo maker among its steps, is a helper
// that makes nothing until applied, and only its use where the file loads is
// reported. `Effect` is
// effect's, imported from `effect` (or an alias), or
// `effect/Effect`, imported whole or by name. A memo made inside a case, a helper or a
// layer's build is that call's own, and is not reported. The config turns
// it on over every test file.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, memberName, type Module } from './nodes.ts';

const MESSAGE =
  "a fixture the file's cases share, made on first use: the case that asks first builds it inside its time limit, and which case pays moves with their order. Build it as the file loads (const x = await Effect.runPromise(…)), or make it in each case.";

const isEffect: Module = (from) => from === 'effect';
const isEffectModule: Module = (from) => from === 'effect/Effect';

/** effect's memo makers: each runs what it wraps on its first use alone. */
const MEMOS = ['cached', 'cachedWithTTL', 'cachedInvalidateWithTTL'];

/** Which memo maker a node names: `Effect.cached`, an alias, or `cached` off `effect/Effect`. */
const memoNamed = (b: Bindings, node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'MemberExpression')
    return Option.filter(
      memberName(node),
      (name) =>
        MEMOS.includes(name) &&
        (b.importsAs(node.object, isEffect, 'Effect') ||
          b.importsAs(node.object, isEffectModule, '*')),
    );
  return Option.fromNullishOr(MEMOS.find((name) => b.importsAs(node, isEffectModule, name)));
};

const isFunctionModule: Module = (from) => from === 'effect/Function';

/** Whether a callee is effect's `name` (`pipe`, `flow`), off `effect` or `effect/Function`. */
const isEffectFunction = (b: Bindings, callee: ESTree.Node, name: string) =>
  b.importsAs(callee, isEffect, name) || b.importsAs(callee, isFunctionModule, name);

/**
 * Whether a call applies its steps to a value: `read.pipe(…)`, or
 * `pipe(read, …)` off effect. A `flow(…)` composes a function, which applies
 * nothing until it is called.
 */
const isPipe = (b: Bindings, call: ESTree.CallExpression) =>
  (call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'pipe')) ||
  isEffectFunction(b, call.callee, 'pipe');

/** How many definitions deep a name is followed to what it holds. */
const DEPTH = 4;

/**
 * Whether a node is a memo maker, a function that makes a memo when applied
 * to an effect: a memo maker itself (`Effect.cached`), a TTL form given its
 * ttl alone (`Effect.cachedWithTTL(ttl)`), a `flow(…)` with one among its
 * steps, or a name a file's own definition binds to one of these.
 */
const isMaker = (b: Bindings, node: ESTree.Node, depth = 0): boolean => {
  if (depth > DEPTH) return false;
  if (Option.isSome(memoNamed(b, node))) return true;
  if (node.type === 'CallExpression') {
    if (Option.exists(memoNamed(b, node.callee), (name) => name !== 'cached'))
      return node.arguments.length === 1;
    return (
      isEffectFunction(b, node.callee, 'flow') &&
      node.arguments.some((step) => isMaker(b, step, depth + 1))
    );
  }
  if (node.type !== 'Identifier') return false;
  return Option.exists(
    b.definitionOf(node),
    ({ node: declared }) =>
      declared.type === 'VariableDeclarator' &&
      Option.exists(Option.fromNullishOr(declared.init), (init) => isMaker(b, init, depth + 1)),
  );
};

/**
 * Whether a call makes a memo: a memo maker given its effect (`cached(read)`,
 * `cachedWithTTL(read, ttl)`), or a memo maker applied
 * (`cachedWithTTL(ttl)(read)`, `withinMinute(read)`).
 */
const makesMemo = (b: Bindings, call: ESTree.CallExpression) =>
  Option.match(memoNamed(b, call.callee), {
    onSome: (name) => call.arguments.length >= 1 + Number(name !== 'cached'),
    onNone: () => call.arguments.length >= 1 && isMaker(b, call.callee),
  });

/** The steps of a pipe that are a memo maker: `read.pipe(Effect.cached)`, `pipe(read, cachedWithTTL(ttl))`. */
const memosPiped = (b: Bindings, call: ESTree.CallExpression) => {
  if (!isPipe(b, call)) return [];
  if (call.callee.type === 'MemberExpression')
    return call.arguments.filter((step) => isMaker(b, step));
  return call.arguments.slice(1).filter((step) => isMaker(b, step));
};

/** The node a callee chain starts at: `describe` for `describe.each(rows)(…)`. */
const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' ||
  n.type === 'FunctionExpression' ||
  n.type === 'FunctionDeclaration';

/** Whether a function is a `describe` body: the runner runs it as the file loads. */
const isDescribeBody = (b: Bindings, fn: ESTree.Node) =>
  Option.exists(
    Option.fromNullishOr(fn.parent),
    (call) =>
      call.type === 'CallExpression' &&
      call.arguments.some((argument) => argument === fn) &&
      Option.exists(rootOf(call.callee), (root) => b.isRunner(root, 'describe')),
  );

/** Whether a call runs as the file loads: inside no function but `describe` bodies. */
const runsAtLoad = (b: Bindings, call: ESTree.Node) =>
  ancestors(call).every((n) => !isFunction(n) || isDescribeBody(b, n));

export const noLazyTestFixture = Rule.define({
  name: 'no-lazy-test-fixture',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test file builds a fixture its cases share as it loads, never on the first case's ask, inside that case's time limit.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          Effect.forEach(
            [...[node].filter((call) => makesMemo(b, call)), ...memosPiped(b, node)],
            (made) => context.report(Diagnostic.make({ node: made, message: MESSAGE })),
            { discard: true },
          ),
          Effect.sync(() => runsAtLoad(b, node)),
        ),
      ),
    );
  },
});
