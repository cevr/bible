// `film/no-point-free-log`: a logger is called, never handed over point-free
// to a call that passes its callback an index. `Console.log` and the
// `Effect.log*` family are variadic, so `Effect.forEach(lines, Console.log)`
// prints each line followed by its index (`… text="tighter" 0`), and a reader
// of the output (a Monitor on `film notes --watch`) gets a field that is not
// there. Write `(line) => Console.log(line)`.
//
// Callbacks passed an index: an array's `forEach`, `map`, `flatMap`,
// `filter`, `some`, `every`, `find`, `findIndex` and `reduce` (and effect's
// `Array` module's, under any name), and `Effect.forEach`, `Effect.filter` and
// `Effect.partition`. The other members of `Effect`, `Stream`, `Option`,
// `Result` and `Layer` pass one value, so `Effect.flatMap(x, Console.log)`
// passes. Each module is read by its binding (`nodes.ts`): `Console`,
// `Effect` and the others are effect's (`import { Console as C } from
// 'effect'`, `import * as Effect from 'effect/Effect'`), and `console` is the
// global; a name of the file's own, of the same spelling, is neither.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName } from './nodes.ts';

/** Methods that pass their callback the element's index after it. */
const INDEXED = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'some',
  'every',
  'find',
  'findIndex',
  'reduce',
]);

/** Effect modules whose callbacks take one value, but for the members in `indexedIn`. */
const ONE_VALUE: ReadonlyArray<string> = ['Effect', 'Stream', 'Option', 'Result', 'Layer'];
const indexedIn = new Set(['forEach', 'filter', 'partition']);

/** Whether `node` is effect's module `name`: `import { Effect } from 'effect'` (or an alias), or `effect/Effect` imported whole. */
const isEffectModule = (b: Bindings, node: ESTree.Node, name: string): boolean =>
  b.importsAs(node, (from) => from === 'effect', name) ||
  b.importsAs(node, (from) => from === `effect/${name}`, '*');

/** `Console.log`, `console.error`, `Effect.logInfo`: the logger an argument names, when it is one. */
const loggerOf = (b: Bindings, n: ESTree.Node): Option.Option<string> => {
  if (n.type !== 'MemberExpression') return Option.none();
  const owner = n.object;
  return Option.flatMap(memberName(n), (name) => {
    if (isEffectModule(b, owner, 'Console')) return Option.some(`Console.${name}`);
    if (b.isGlobal(owner, 'console')) return Option.some(`console.${name}`);
    if (isEffectModule(b, owner, 'Effect') && name.startsWith('log'))
      return Option.some(`Effect.${name}`);
    return Option.none();
  });
};

/** Whether a call passes its callback an index: `xs.forEach(f)`, `Effect.forEach(xs, f)`, not `Effect.flatMap(x, f)`. */
const passesIndex = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return false;
  return Option.exists(memberName(callee), (name) => {
    if (ONE_VALUE.some((module) => isEffectModule(b, callee.object, module)))
      return indexedIn.has(name);
    return INDEXED.has(name);
  });
};

export const noPointFreeLog = Rule.define({
  name: 'no-point-free-log',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A variadic logger (Console.*, console.*, Effect.log*) handed point-free to a callback that is passed an index prints the index after each line.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          Effect.forEach(
            node.arguments.flatMap((a) =>
              Option.toArray(loggerOf(b, a)).map((name) => ({ a, name })),
            ),
            ({ a, name }) =>
              context.report(
                Diagnostic.make({
                  node: a,
                  message: `${name} passed point-free: it is variadic, and this call passes the index too, which it prints after each line. Write (line) => ${name}(line).`,
                }),
              ),
          ),
          Effect.succeed(passesIndex(b, node)),
        ),
      ),
    );
  },
});
