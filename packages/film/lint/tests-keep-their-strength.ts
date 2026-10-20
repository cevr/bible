// `film/tests-keep-their-strength`: a test runs every time, at its full
// strength, and passes as written. Nothing makes one pass or fit the ten
// second budget (`bun run test:budget`) by running it less or giving it more
// time; a slow test is made fast (shared setup, TestClock, its work run
// concurrently), and a failing one is fixed.
//
// Refused, on a test runner's `it`, `test` or `describe` (`bun:test`'s,
// `effect-bun-test`'s or bun's global, by its binding, `nodes.ts`):
//
// - a member that runs a test less: `.skip`, `.only`, `.todo`, `.failing`,
//   `.skipIf`, `.todoIf`, `.if` and `.runIf`, anywhere on the chain
//   (`it.effect.skip`, `test.skipIf(c)(…)`), and the runner's `xit`, `xtest`,
//   `xdescribe`, `fit` and `fdescribe`;
// - a `retry` in a test's or a suite's options, which passes a test that
//   fails;
// - a timeout of its own (a number after the body, or `{ timeout }` in the
//   options, before the body or after it) over bun's 5 s default, of 0 or
//   under (which sets no deadline at all), or one the rule cannot read (a name imported from another file), unless the test
//   starts a process: a spawn's time is the machine's, and such a test names
//   its spawn budget (`effect/requireSpawnBudget`). A suite's timeout passes
//   when a test inside it starts one;
// - the runner's `setDefaultTimeout` over bun's 5 s, or of 0 or under, which
//   raises every test after it.
//
// A test starts a process when its body calls a process starter (Bun's
// `spawn` or `spawnSync`, off the global `Bun`, imported from `bun` or taken
// apart from `Bun`, a `node:child_process` starter, or effect's
// `ChildProcess.make`), or calls a function of the same file that does,
// however deep. A spawn inside a service the test provides, or a helper
// imported from another file, is not seen. With `{ "timeouts": false }` the
// rule reads no timeouts: a browser suite outside the budget sizes its own.

import { Effect, Option, Schema } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import {
  ancestors,
  type Bindings,
  bindings,
  collect,
  keyName,
  memberName,
  type Module,
} from './nodes.ts';

/** bun's own timeout for a test that names none, in milliseconds. */
const BUN_DEFAULT_MS = 5_000;

/** The members of a runner that run a test less than every time. */
const WEAKENERS = new Set(['skip', 'only', 'todo', 'failing', 'skipIf', 'todoIf', 'if', 'runIf']);

/** The runner's names that skip or focus a test by their spelling. */
const PREFIXED = ['xit', 'xtest', 'xdescribe', 'fit', 'fdescribe'];

const Options = Schema.UndefinedOr(Schema.Struct({ timeouts: Schema.optionalKey(Schema.Boolean) }));

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

/** The node a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

/** Whether `n` starts a chain at the runner's `it`, `test` or `describe`. */
const onRunner = (b: Bindings, n: ESTree.Node) =>
  Option.exists(
    rootOf(n),
    (root) => b.isRunner(root, 'it') || b.isRunner(root, 'test') || b.isRunner(root, 'describe'),
  );

/** Whether a call is a suite: its chain names `describe`. */
const isSuiteCall = (b: Bindings, call: ESTree.CallExpression) =>
  Option.exists(rootOf(call.callee), (root) => b.isRunner(root, 'describe'));

/** A test or a suite: a call on the runner's chain with a function among its arguments. */
const isCase = (b: Bindings, n: ESTree.Node): n is ESTree.CallExpression =>
  n.type === 'CallExpression' && onRunner(b, n.callee) && n.arguments.some(isFunction);

const isBun: Module = (from) => from === 'bun';
const isNodeChildProcess: Module = (from) =>
  from === 'node:child_process' || from === 'child_process';
const isProcess: Module = (from) => from === 'effect/process';
const isChildProcess: Module = (from) => from === 'effect/process/ChildProcess';
const BUN_SPAWNS = ['spawn', 'spawnSync'];
const NODE_SPAWNS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];

/** Whether `n` is effect's `ChildProcess` module: `ChildProcess` off `effect/process`, or its module whole. */
const isChildProcessModule = (b: Bindings, n: ESTree.Node) =>
  b.readsImport(n, isProcess, 'ChildProcess') || b.importsAs(n, isChildProcess, '*');

/** Whether a call starts a process, or makes the command an effect spawner starts. */
const startsProcess = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'MemberExpression')
    return Option.exists(memberName(callee), (name) => {
      if (BUN_SPAWNS.includes(name) && b.isGlobal(callee.object, 'Bun')) return true;
      if (NODE_SPAWNS.includes(name) && b.importsAs(callee.object, isNodeChildProcess, '*'))
        return true;
      return name === 'make' && isChildProcessModule(b, callee.object);
    });
  if (callee.type !== 'Identifier') return false;
  const imported = b.importOf(callee);
  if (
    Option.exists(
      imported,
      ({ from, name }) =>
        (isBun(from) && BUN_SPAWNS.includes(name)) ||
        (isNodeChildProcess(from) && NODE_SPAWNS.includes(name)) ||
        (isChildProcess(from) && name === 'make'),
    )
  )
    return true;
  return Option.exists(
    b.takenFrom(callee),
    ({ key, value }) => BUN_SPAWNS.includes(key) && b.isGlobal(value, 'Bun'),
  );
};

/** Whether a declarator names a function: `const f = (…) => …`, or one a call builds, `Effect.fn('f')(function* …)`. */
const declaresFunction = (d: ESTree.VariableDeclarator) =>
  Option.exists(
    Option.fromNullOr(d.init),
    (init) =>
      isFunction(init) || (init.type === 'CallExpression' && init.callee.type === 'CallExpression'),
  );

/** Whether a declarator is the module's own: its declaration stands at the top of the file, exported or not. */
const atTop = (d: ESTree.VariableDeclarator) => {
  const declaration = d.parent;
  return (
    declaration.type === 'VariableDeclaration' &&
    (declaration.parent.type === 'Program' ||
      (declaration.parent.type === 'ExportNamedDeclaration' &&
        declaration.parent.parent.type === 'Program'))
  );
};

/**
 * Where a name is read: the nearest test or suite around it, or the binding
 * of the file whose value reads it, a function or a module `const` (an
 * effect built once, `const run = Effect.gen(…)`).
 */
const hostOf = (b: Bindings, n: ESTree.Node): Option.Option<ESTree.Node> => {
  for (const a of ancestors(n)) {
    if (isCase(b, a)) return Option.some(a);
    if (
      a.type === 'VariableDeclarator' &&
      a.id.type === 'Identifier' &&
      (declaresFunction(a) || atTop(a))
    )
      return Option.some(a.id);
    if (a.type === 'FunctionDeclaration') return Option.fromNullOr(a.id);
  }
  return Option.none();
};

/** The call whose callee `n` names: `spawn` in `spawn(…)`, or `Bun` and `spawn` in `Bun.spawn(…)`. */
const calleeCall = (n: ESTree.Node): Option.Option<ESTree.CallExpression> => {
  const p = n.parent;
  if (p?.type === 'CallExpression' && p.callee === n) return Option.some(p);
  if (p?.type === 'MemberExpression' && p.parent.type === 'CallExpression' && p.parent.callee === p)
    return Option.some(p.parent);
  return Option.none();
};

/** Whether an identifier is read as a name: not a member's or a key's name. */
const readAsName = (n: ESTree.Node) => {
  const p = n.parent;
  if (p?.type === 'MemberExpression') return p.object === n || p.computed;
  if (p?.type === 'Property') return p.value === n || p.computed;
  return true;
};

/** A name the rule follows: where it is read, whether its call starts a process, and the file's binding it reads. */
interface Sighting {
  readonly host: Option.Option<ESTree.Node>;
  readonly starts: boolean;
  readonly reads: Option.Option<ESTree.Node>;
}

const sightingOf =
  (b: Bindings) =>
  (n: ESTree.Node): Option.Option<Sighting> => {
    if (n.type !== 'Identifier') return Option.none();
    const starts = Option.exists(calleeCall(n), (call) => startsProcess(b, call));
    const reads = Option.filter(
      Option.flatMap(Option.liftPredicate(n, readAsName), (id) =>
        Option.map(b.definitionOf(id), (d): ESTree.Node => d.name),
      ),
      (binding) => binding !== n,
    );
    if (!starts && Option.isNone(reads)) return Option.none();
    return Option.some({ host: hostOf(b, n), starts, reads });
  };

/** The hosts that start a process: each test, function or module `const` that starts one, or reads one that does. */
const startingHosts = (sightings: ReadonlyArray<Sighting>) => {
  const starting = new Set<ESTree.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const sighting of sightings)
      Option.map(sighting.host, (host) => {
        if (starting.has(host)) return;
        if (sighting.starts || Option.exists(sighting.reads, (binding) => starting.has(binding))) {
          starting.add(host);
          grew = true;
        }
      });
  }
  return starting;
};

/** What a case names as its timeout: none, a number read, or a value the rule cannot read. */
type Timeout =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Read'; readonly ms: number; readonly node: ESTree.Node }
  | { readonly _tag: 'Unread'; readonly node: ESTree.Node };

const NONE: Timeout = { _tag: 'None' };

/** A timeout's value: a number written out or held by a top-level const, else unread. */
const timeoutValue = (b: Bindings, n: ESTree.Node): Timeout =>
  Option.match(b.numberOf(n), {
    onNone: (): Timeout => ({ _tag: 'Unread', node: n }),
    onSome: (ms): Timeout => ({ _tag: 'Read', ms, node: n }),
  });

/** The property `key` of an object literal. */
const propertyOf = (o: ESTree.ObjectExpression, key: string) =>
  Option.fromUndefinedOr(
    o.properties.find(
      (p): p is ESTree.ObjectProperty => p.type === 'Property' && Option.contains(keyName(p), key),
    ),
  );

/** The arguments of a case past its name and its body: its timeout, or its options. */
const namedArguments = (call: ESTree.CallExpression) => {
  const body = call.arguments.findIndex(isFunction);
  return call.arguments.filter((_, at) => at !== body && (at !== 0 || body === 0));
};

/** The timeout a case names: a number after its body, or `{ timeout }` in its options. */
const timeoutOf = (b: Bindings, call: ESTree.CallExpression): Timeout => {
  for (const argument of namedArguments(call)) {
    if (argument.type === 'SpreadElement') continue;
    if (argument.type !== 'ObjectExpression') return timeoutValue(b, argument);
    const timeout = propertyOf(argument, 'timeout');
    if (Option.isSome(timeout)) return timeoutValue(b, timeout.value.value);
  }
  return NONE;
};

/** The `retry` a case's options name. */
const retryOf = (call: ESTree.CallExpression) =>
  Option.firstSomeOf(
    namedArguments(call).map((argument) =>
      Option.flatMap(
        Option.liftPredicate(
          argument,
          (a): a is ESTree.ObjectExpression => a.type === 'ObjectExpression',
        ),
        (options) => propertyOf(options, 'retry'),
      ),
    ),
  );

/** Whether a timeout is over bun's default, sets none (0 or under), or cannot be read. */
const raises = (timeout: Timeout) =>
  timeout._tag === 'Unread' ||
  (timeout._tag === 'Read' && (timeout.ms > BUN_DEFAULT_MS || timeout.ms <= 0));

const weakenerMessage = (member: string) =>
  `\`${member}\` runs a test less than every time: a test runs every time and passes as written. Fix what it tests and drop \`${member}\`, or delete the test with the code it held.`;

const PREFIX_MESSAGE =
  'a prefixed runner skips or focuses its test: a test runs every time and passes as written. Use the runner plainly, and fix what the test holds.';

const RETRY_MESSAGE =
  'a retry passes a test that fails: find why it fails (a race, a shared fixture, a wall clock) and fix that.';

const TIMEOUT_MESSAGE =
  "a timeout over bun's 5 s, or of 0 (none), on a test that starts no process: make the test fast (share its setup, use TestClock, run its work concurrently), never give it more time. A test that spawns names its spawn budget (effect/requireSpawnBudget).";

const DEFAULT_MESSAGE =
  "a default timeout over bun's 5 s, or of 0 (none), raises every test after it: make the slow tests fast, and give a test that spawns its own spawn budget.";

/** What the rule refuses on one member read: a weakener on the runner's chain. */
const weakenerAt = (b: Bindings, n: ESTree.MemberExpression) =>
  Option.flatMap(
    Option.filter(memberName(n), (name) => WEAKENERS.has(name) && onRunner(b, n.object)),
    (name) => Option.some(Diagnostic.make({ node: n.property, message: weakenerMessage(name) })),
  );

/** Whether a call is the runner's `setDefaultTimeout(…)`. */
const setsDefault = (b: Bindings, call: ESTree.CallExpression) =>
  call.callee.type === 'Identifier' && b.isRunner(call.callee, 'setDefaultTimeout');

export const testsKeepTheirStrength = Rule.define({
  name: 'tests-keep-their-strength',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A test runs every time at its full strength: no skip, only, todo, retry, or timeout over bun’s 5 s but a spawn budget.',
    schema: [
      {
        type: 'object',
        properties: { timeouts: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
  }),
  options: Options,
  create: function* (options) {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const timeouts = options?.timeouts ?? true;
    const report = (node: ESTree.Node, message: string) =>
      context.report(Diagnostic.make({ node, message }));
    const members = Visitor.on('MemberExpression', (n) =>
      Option.match(weakenerAt(b, n), {
        onNone: () => Effect.void,
        onSome: (diagnostic) => context.report(diagnostic),
      }),
    );
    const prefixed = Visitor.on('Identifier', (n) =>
      Effect.asVoid(
        Effect.when(
          report(n, PREFIX_MESSAGE),
          Effect.succeed(
            PREFIXED.includes(n.name) &&
              n.parent.type === 'CallExpression' &&
              n.parent.callee === n &&
              b.isRunner(n, n.name),
          ),
        ),
      ),
    );
    const cases: Array<ESTree.CallExpression> = [];
    const defaults: Array<ESTree.CallExpression> = [];
    const calls = Visitor.on('CallExpression', (n) =>
      Effect.sync(() => {
        if (isCase(b, n)) cases.push(n);
        if (timeouts && setsDefault(b, n)) defaults.push(n);
      }),
    );
    // Every name is kept as met, and read for spawns only when a case raises
    // its timeout: most files raise none, and the read is the rule's cost.
    const names = collect('Identifier', Option.some, (identifiers) => {
      const raising = cases.flatMap((call) => {
        const timeout = timeoutOf(b, call);
        if (!timeouts || timeout._tag === 'None' || !raises(timeout)) return [];
        return [{ call, node: timeout.node }];
      });
      const startingOf = () => {
        if (raising.length === 0) return new Set<ESTree.Node>();
        return startingHosts(identifiers.flatMap((n) => Option.toArray(sightingOf(b)(n))));
      };
      const starting = startingOf();
      /** Whether a case, or for a suite a case inside it, starts a process. */
      const spawns = (call: ESTree.CallExpression) =>
        starting.has(call) ||
        (isSuiteCall(b, call) &&
          cases.some((inner) => starting.has(inner) && ancestors(inner).includes(call)));
      const retries = cases.flatMap((call) =>
        Option.toArray(Option.map(retryOf(call), (p) => ({ node: p, message: RETRY_MESSAGE }))),
      );
      const raised = raising
        .filter(({ call }) => !spawns(call))
        .map(({ node }) => ({ node, message: TIMEOUT_MESSAGE }));
      const raisedDefaults = defaults.flatMap((n) => {
        const value = Option.fromUndefinedOr(n.arguments[0]);
        if (Option.isNone(value) || value.value.type === 'SpreadElement') return [];
        if (!raises(timeoutValue(b, value.value))) return [];
        return [{ node: n, message: DEFAULT_MESSAGE }];
      });
      return Effect.forEach(
        [...retries, ...raised, ...raisedDefaults],
        (finding) => report(finding.node, finding.message),
        { discard: true },
      );
    });
    return Visitor.merge(Visitor.merge(members, prefixed), Visitor.merge(calls, names));
  },
});
