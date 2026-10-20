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
// A memo is made by `cached(read)`, by a TTL form given its effect, or by a
// memo maker a pipe applies (`read.pipe(Effect.cached)`,
// `read.pipe(Effect.cachedWithTTL(ttl))`); a TTL form given its ttl alone and
// kept for later is a helper, which makes nothing until applied. `Effect` is
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

/** Whether a node is an argument of the call that holds it: a pipe step, for one. */
const isArgument = (node: ESTree.Node) =>
  Option.exists(
    Option.fromNullishOr(node.parent),
    (parent) =>
      parent.type === 'CallExpression' && parent.arguments.some((argument) => argument === node),
  );

/**
 * Whether a call makes a memo: `cached(read)`, a TTL form given its effect
 * (`cachedWithTTL(read, ttl)`), or a TTL form given its ttl alone where a
 * pipe applies it (`read.pipe(cachedWithTTL(ttl))`). A TTL form given its
 * ttl and kept for later is a helper, which makes nothing until applied.
 */
const makesMemo = (b: Bindings, call: ESTree.CallExpression) =>
  Option.exists(
    memoNamed(b, call.callee),
    (name) => name === 'cached' || call.arguments.length >= 2 || isArgument(call),
  );

/** The arguments of a call that are a memo maker itself, handed to a pipe: `read.pipe(Effect.cached)`. */
const memosPiped = (b: Bindings, call: ESTree.CallExpression) =>
  call.arguments.filter((argument) => Option.isSome(memoNamed(b, argument)));

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
