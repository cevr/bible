// `film/told-after-answer`: a fake route tells the case it was asked only
// through the harness's `told(tell, then)` (`lab/fixtures/harness.ts`), which
// runs the tell once its answer is made. Completing a `Deferred` runs the
// fiber waiting on it at once, inside the call (effect resumes a waiter
// synchronously), so a case told before the answer is made can change what
// the answer says: it moves on to its next step (another hand's write, a line
// put back) and the answer, made after, carries that step rather than the
// read the case was told of. Which comes first then turns on nothing the case
// controls, and the case passes or hangs by the machine's load.
//
// Refused: in the answer handed to the harness's `route(…)` (a function
// written there, or a name bound to one: a `const`, a function declaration),
// at any depth (a condition, an expression body, a nested function, an effect
// the answer makes), a call of effect's `Deferred` that completes one:
// `complete`, `completeWith`, `done`, `doneUnsafe`, `fail`, `failCause`,
// `failCauseSync`, `failSync`, `die`, `dieSync`, `interrupt`,
// `interruptWith`, `into`, `succeed` or `sync`. Each name is read by its
// binding (`nodes.ts`): `route` and `told` imported from the harness (under
// an alias, or off the module imported whole), `Deferred` imported from
// `effect`, or the `effect/Deferred` module imported whole or by name. An
// effect that completes one (any of them but `doneUnsafe`, which completes
// it as it is called) passes inside `told`'s first argument: it runs when
// `told` runs it. A `Deferred` the answer declares itself is its own, and
// passes. `make`, `makeUnsafe`, `await`, `isDone`, `isDoneUnsafe`, `poll` and
// `isDeferred` complete nothing. A helper the answer calls is not followed.
// The config turns it on over `packages/film/e2e`.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, memberName, type Module, unwrapped } from './nodes.ts';

const MESSAGE =
  'a fake route completes a Deferred itself: the case waiting on it runs on at once, inside the call, and an answer made after reads what the case changed then. Tell through the harness: told(Deferred.done(asked, Exit.void), json(…)) runs the tell once its answer is made.';

/** The harness the fake routes and `told` are exported from. */
const isHarness: Module = (from) => /(?:^|\/)fixtures\/harness(?:\.[jt]s)?$/u.test(from);
const isEffect: Module = (from) => from === 'effect';
const isDeferredModule: Module = (from) => from === 'effect/Deferred';

/** The calls of effect's `Deferred` that complete one. */
const TELLS: ReadonlyArray<string> = [
  'complete',
  'completeWith',
  'done',
  'doneUnsafe',
  'fail',
  'failCause',
  'failCauseSync',
  'failSync',
  'die',
  'dieSync',
  'interrupt',
  'interruptWith',
  'into',
  'succeed',
  'sync',
];

/** The one that completes a `Deferred` as it is called, not as an effect run later. */
const UNSAFE = 'doneUnsafe';

/**
 * The `Deferred` call that completes one which `call` makes, by its name:
 * `Deferred.done(…)` off effect's `Deferred`, `D.done(…)` off the module
 * imported whole, `done(…)` imported from it.
 */
const tellOf = (b: Bindings, call: ESTree.CallExpression): Option.Option<string> => {
  const callee = unwrapped(call.callee);
  return Option.fromUndefinedOr(
    TELLS.find(
      (name) =>
        b.readsImport(callee, isDeferredModule, name) ||
        (callee.type === 'MemberExpression' &&
          Option.contains(memberName(callee), name) &&
          b.readsImport(callee.object, isEffect, 'Deferred')),
    ),
  );
};

const isFunction = (n: ESTree.Node): boolean =>
  n.type === 'ArrowFunctionExpression' ||
  n.type === 'FunctionExpression' ||
  n.type === 'FunctionDeclaration';

/** The answer handed to a `route(…)` call: the function written there, or the one a name there is bound to. */
const answerOf = (b: Bindings, call: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const handed = Option.map(Option.fromUndefinedOr(call.arguments[2]), unwrapped);
  return Option.flatMap(handed, (n) => {
    if (isFunction(n)) return Option.some(n);
    if (n.type !== 'Identifier') return Option.none();
    return Option.flatMap(b.definitionOf(n), (def) => {
      if (def.type === 'FunctionName') return Option.some(def.node);
      const declarator = def.node;
      if (def.type !== 'Variable' || declarator.type !== 'VariableDeclarator') return Option.none();
      if (declarator.parent.type !== 'VariableDeclaration' || declarator.parent.kind !== 'const')
        return Option.none();
      return Option.filter(Option.fromNullishOr(declarator.init), (init) =>
        isFunction(unwrapped(init)),
      ).pipe(Option.map(unwrapped));
    });
  });
};

/** Whether `inner` lies inside `outer`. */
const inside = (inner: ESTree.Node, outer: ESTree.Node): boolean =>
  ancestors(inner).some((n) => n === outer);

/** The `Deferred` a tell completes, as written: its first argument, `into`'s second. */
const completed = (call: ESTree.CallExpression, name: string): Option.Option<ESTree.Node> => {
  if (name === 'into') return Option.fromUndefinedOr(call.arguments[1]);
  return Option.fromUndefinedOr(call.arguments[0]);
};

/** Whether the tell completes a `Deferred` the answer declares itself. */
const ownOf = (b: Bindings, call: ESTree.CallExpression, name: string, answer: ESTree.Node) =>
  Option.exists(completed(call, name), (arg) => {
    const n = unwrapped(arg);
    return (
      n.type === 'Identifier' && Option.exists(b.definitionOf(n), (def) => inside(def.name, answer))
    );
  });

/**
 * Whether the tell stands inside `told`'s first argument within the answer:
 * an effect `told` runs once its answer is made. `doneUnsafe` completes as it
 * is called, so it stands there only inside a function of that argument.
 */
const throughTold = (
  b: Bindings,
  call: ESTree.CallExpression,
  name: string,
  answer: ESTree.Node,
): boolean => {
  const up = ancestors(call);
  const path = up.slice(0, up.indexOf(answer));
  return path.some((n, i) => {
    const arg = path[i - 1] ?? call;
    if (n.type !== 'CallExpression' || n.arguments[0] !== arg) return false;
    if (!b.callsImport(n, isHarness, 'told')) return false;
    return name !== UNSAFE || path.slice(0, i).some(isFunction);
  });
};

export const toldAfterAnswer = Rule.define({
  name: 'told-after-answer',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A fake route tells the case it was asked only through the harness's told(tell, then): a tell runs the case at once, and an answer made after reads what the case changed.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return yield* Visitor.accumulate(
      'CallExpression',
      (n) =>
        Option.liftPredicate(
          n,
          (call): call is ESTree.CallExpression =>
            call.type === 'CallExpression' &&
            (b.callsImport(call, isHarness, 'route') || Option.isSome(tellOf(b, call))),
        ),
      (calls) => {
        const answers = new Set(
          calls
            .filter((call) => b.callsImport(call, isHarness, 'route'))
            .flatMap((call) => Option.toArray(answerOf(b, call))),
        );
        const refused = calls.filter((call) =>
          Option.exists(tellOf(b, call), (name) => {
            const answer = Option.fromUndefinedOr(ancestors(call).find((n) => answers.has(n)));
            return Option.exists(
              answer,
              (fn) => !ownOf(b, call, name, fn) && !throughTold(b, call, name, fn),
            );
          }),
        );
        return Effect.forEach(
          refused,
          (call) => context.report(Diagnostic.make({ node: call, message: MESSAGE })),
          { discard: true },
        );
      },
    );
  },
});
