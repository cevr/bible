// `film/spawn-budget`: a test that spawns a process declares its timeout. A
// spawn is a cold start whose time is the machine's, not the test's: a CLI
// spawn takes under a second idle and has taken over bun's default 5 s while
// sibling renders loaded every core. Give the test its budget, in
// milliseconds, as its last argument.
//
// A test is a call of the runner's `it` or `test` (`bun:test`'s,
// `effect-bun-test`'s or bun's global; `it.effect`, `it.live`,
// `it.effect.layer(…)`) with a name and a body. It spawns when its body calls
// effect's `ChildProcess.make`, the global `Bun`'s `spawn` or `spawnSync`
// (read off it, or taken apart from it), `spawn` or `spawnSync` imported from
// `bun`, or a function of the same file that does, however deep. Each name is
// read by its binding (`nodes.ts`): a parameter or a local of the same
// spelling is none of these, and a helper is the binding its call resolves
// to, not a name. A test with a third argument has its budget.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, memberName, type Module } from './nodes.ts';

/** Bun's spawns. */
const BUN_SPAWNS: ReadonlyArray<string> = ['spawn', 'spawnSync'];

/** Effect's process modules: `effect/process`, or `effect/process/ChildProcess` imported whole. */
const isProcess: Module = (from) => from === 'effect/process';
const isChildProcess: Module = (from) => from === 'effect/process/ChildProcess';

/** Whether `node` is effect's `ChildProcess` module. */
const isChildProcessModule = (b: Bindings, node: ESTree.Node) =>
  b.readsImport(node, isProcess, 'ChildProcess') || b.importsAs(node, isChildProcess, '*');

/** The node a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

/** A test: the runner's `it…(name, body, …)` or `test…(name, body, …)`. */
const isTest = (b: Bindings, n: ESTree.Node): n is ESTree.CallExpression =>
  n.type === 'CallExpression' &&
  Option.exists(rootOf(n.callee), (root) => b.isRunner(root, 'it') || b.isRunner(root, 'test')) &&
  n.arguments.some(isFunction);

/** Whether a call spawns a process itself. */
const spawns = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'MemberExpression')
    return Option.exists(memberName(callee), (name) => {
      if (name === 'make') return isChildProcessModule(b, callee.object);
      return BUN_SPAWNS.includes(name) && b.isGlobal(callee.object, 'Bun');
    });
  if (callee.type !== 'Identifier') return false;
  if (BUN_SPAWNS.some((name) => b.importsAs(callee, (from) => from === 'bun', name))) return true;
  return Option.exists(
    b.takenFrom(callee),
    ({ key, value }) => BUN_SPAWNS.includes(key) && b.isGlobal(value, 'Bun'),
  );
};

/** What a call reaches: a spawn, a function of the file (by the binding its callee resolves to), or nothing. */
type Reached =
  | { readonly _tag: 'Spawn' }
  | { readonly _tag: 'Helper'; readonly binding: ESTree.Node };

const reached = (b: Bindings, call: ESTree.CallExpression): Option.Option<Reached> => {
  if (spawns(b, call)) return Option.some({ _tag: 'Spawn' });
  if (call.callee.type !== 'Identifier') return Option.none();
  return Option.map(b.definitionOf(call.callee), (def) => ({ _tag: 'Helper', binding: def.name }));
};

/**
 * Whether a declarator names a function: `const f = (…) => …`, or one built
 * by a call, `const f = Effect.fn('f')(function* …)`. A value a test's body
 * binds (`const run = yield* cli(…)`) is not one: its calls are the test's.
 */
const declaresFunction = (d: ESTree.VariableDeclarator) =>
  Option.exists(
    Option.fromNullOr(d.init),
    (init) =>
      isFunction(init) || (init.type === 'CallExpression' && init.callee.type === 'CallExpression'),
  );

/** Where a call is made: in a test's body, or in a function declared by name (its binding). */
type Host =
  | { readonly _tag: 'Test'; readonly test: ESTree.CallExpression }
  | { readonly _tag: 'Helper'; readonly binding: ESTree.Node };

const hostOf = (b: Bindings, n: ESTree.Node): Option.Option<Host> =>
  Option.fromUndefinedOr(
    ancestors(n)
      .flatMap((a): ReadonlyArray<Host> => {
        if (isTest(b, a)) return [{ _tag: 'Test', test: a }];
        if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && declaresFunction(a))
          return [{ _tag: 'Helper', binding: a.id }];
        if (a.type === 'FunctionDeclaration')
          return Option.toArray(Option.fromNullOr(a.id)).map((id) => ({
            _tag: 'Helper' as const,
            binding: id,
          }));
        return [];
      })
      .at(0),
  );

type Seen =
  | { readonly _tag: 'Call'; readonly reached: Reached; readonly host: Host }
  | { readonly _tag: 'Unbudgeted'; readonly test: ESTree.CallExpression };

const seen =
  (b: Bindings) =>
  (n: ESTree.Node): Option.Option<ReadonlyArray<Seen>> => {
    if (n.type !== 'CallExpression') return Option.none();
    const out: Array<Seen> = [];
    if (isTest(b, n) && n.arguments.length < 3) out.push({ _tag: 'Unbudgeted', test: n });
    const to = reached(b, n);
    const host = hostOf(b, n);
    if (Option.isSome(to) && Option.isSome(host))
      out.push({ _tag: 'Call', reached: to.value, host: host.value });
    return Option.liftPredicate(out, (all) => all.length > 0);
  };

type Call = Extract<Seen, { _tag: 'Call' }>;

/** Whether a call spawns, given the helpers that do. */
const reachesSpawn = (call: Call, spawning: ReadonlySet<ESTree.Node>) =>
  call.reached._tag === 'Spawn' || spawning.has(call.reached.binding);

/** The helpers that spawn, directly or through one another, by binding. */
const spawningHelpers = (calls: ReadonlyArray<Call>) => {
  const spawning = new Set<ESTree.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const call of calls)
      if (
        call.host._tag === 'Helper' &&
        !spawning.has(call.host.binding) &&
        reachesSpawn(call, spawning)
      ) {
        spawning.add(call.host.binding);
        grew = true;
      }
  }
  return spawning;
};

export const spawnBudget = Rule.define({
  name: 'spawn-budget',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test that spawns a process declares its timeout: a cold start's time is the machine's, and bun's default 5 s fails a loaded one.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return yield* Visitor.accumulate('CallExpression', seen(b), (batches) => {
      const all = batches.flat();
      const calls = all.filter((s): s is Call => s._tag === 'Call');
      const spawning = spawningHelpers(calls);
      const spawnsIn = (test: ESTree.CallExpression) =>
        calls.some(
          (c) => c.host._tag === 'Test' && c.host.test === test && reachesSpawn(c, spawning),
        );
      return Effect.forEach(
        all.flatMap((s) => {
          if (s._tag === 'Unbudgeted' && spawnsIn(s.test)) return [s.test];
          return [];
        }),
        (test) =>
          context.report(
            Diagnostic.make({
              node: test,
              message:
                "this test spawns a process and has no timeout: a cold start's time is the machine's, so give it its budget in milliseconds as the last argument.",
            }),
          ),
        { discard: true },
      );
    });
  },
});
