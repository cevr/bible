// `film/spawn-budget`: a test that spawns a process declares its timeout. A
// spawn is a cold start whose time is the machine's, not the test's: the CLI
// over the fixture film takes under a second idle and has taken over bun's
// default 5 s while sibling renders loaded every core (passes 5 and 6 each
// lost a gate to one such test). Give the test its budget as its last
// argument: `spawnBudget(n)` from `apps/animations/test/cli-run.ts` for n CLI
// spawns, or a number of milliseconds.
//
// A test is a call to `it` or `test` (`it.effect`, `it.live`,
// `it.effect.layer(…)`) with a name and a body. It spawns when its body calls
// `ChildProcess.make`, `Bun.spawn`, `Bun.spawnSync` or `runCli`, or a function
// of the same file that does, however deep. A test with a third argument has
// its budget.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName } from './nodes.ts';

/** The name `SPAWN` stands for a call that spawns: its host spawns. */
const SPAWN = '(spawn)';

/** Calls that spawn a process, by `Owner.member`, and helpers that do, by name. */
const SPAWNS = new Set(['ChildProcess.make', 'Bun.spawn', 'Bun.spawnSync']);
const SPAWNING_IMPORTS = new Set(['runCli']);

/** The identifier a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootName = (n: ESTree.Node): Option.Option<string> => {
  if (n.type === 'Identifier') return Option.some(n.name);
  if (n.type === 'MemberExpression') return rootName(n.object);
  if (n.type === 'CallExpression') return rootName(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

/** A test: `it…(name, body, …)` or `test…(name, body, …)`. */
const isTest = (n: ESTree.Node): n is ESTree.CallExpression =>
  n.type === 'CallExpression' &&
  Option.exists(rootName(n.callee), (name) => name === 'it' || name === 'test') &&
  n.arguments.some(isFunction);

/** What a call names: `SPAWN` for a spawn, a plain function's name, or nothing. */
const calledName = (call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  if (callee.type === 'Identifier') {
    if (SPAWNING_IMPORTS.has(callee.name)) return Option.some(SPAWN);
    return Option.some(callee.name);
  }
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier')
    return Option.none();
  const owner = callee.object.name;
  return Option.flatMap(memberName(callee), (name) =>
    Option.map(
      Option.liftPredicate(`${owner}.${name}`, (full) => SPAWNS.has(full)),
      () => SPAWN,
    ),
  );
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

/** Where a call is made: in a test's body, or in a function declared by name. */
type Host =
  | { readonly _tag: 'Test'; readonly test: ESTree.CallExpression }
  | { readonly _tag: 'Helper'; readonly name: string };

const hostOf = (n: ESTree.Node): Option.Option<Host> =>
  Option.fromUndefinedOr(
    ancestors(n)
      .flatMap((a): ReadonlyArray<Host> => {
        if (isTest(a)) return [{ _tag: 'Test', test: a }];
        if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && declaresFunction(a))
          return [{ _tag: 'Helper', name: a.id.name }];
        if (a.type === 'FunctionDeclaration')
          return Option.toArray(Option.fromNullOr(a.id)).map((id) => ({
            _tag: 'Helper' as const,
            name: id.name,
          }));
        return [];
      })
      .at(0),
  );

type Seen =
  | { readonly _tag: 'Call'; readonly name: string; readonly host: Host }
  | { readonly _tag: 'Unbudgeted'; readonly test: ESTree.CallExpression };

const seen = (n: ESTree.Node): Option.Option<ReadonlyArray<Seen>> => {
  if (n.type !== 'CallExpression') return Option.none();
  const out: Array<Seen> = [];
  if (isTest(n) && n.arguments.length < 3) out.push({ _tag: 'Unbudgeted', test: n });
  const name = calledName(n);
  const host = hostOf(n);
  if (Option.isSome(name) && Option.isSome(host))
    out.push({ _tag: 'Call', name: name.value, host: host.value });
  return Option.liftPredicate(out, (all) => all.length > 0);
};

/** The helpers that spawn, directly or through one another. */
const spawningHelpers = (calls: ReadonlyArray<Extract<Seen, { _tag: 'Call' }>>) => {
  const spawning = new Set([SPAWN]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const call of calls)
      if (call.host._tag === 'Helper' && spawning.has(call.name) && !spawning.has(call.host.name)) {
        spawning.add(call.host.name);
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
    return yield* Visitor.accumulate('CallExpression', seen, (batches) => {
      const all = batches.flat();
      const calls = all.filter((s): s is Extract<Seen, { _tag: 'Call' }> => s._tag === 'Call');
      const spawning = spawningHelpers(calls);
      const spawns = (test: ESTree.CallExpression) =>
        calls.some((c) => c.host._tag === 'Test' && c.host.test === test && spawning.has(c.name));
      return Effect.forEach(
        all.flatMap((s) => {
          if (s._tag === 'Unbudgeted' && spawns(s.test)) return [s.test];
          return [];
        }),
        (test) =>
          context.report(
            Diagnostic.make({
              node: test,
              message:
                "this test spawns a process and has no timeout: a cold start's time is the machine's, so give it its budget as the last argument (spawnBudget(n) for n CLI spawns, or milliseconds).",
            }),
          ),
        { discard: true },
      );
    });
  },
});
